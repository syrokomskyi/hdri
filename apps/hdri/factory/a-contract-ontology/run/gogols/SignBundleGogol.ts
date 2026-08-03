/*
<MODULE_CONTRACT>
<purpose>Signs resolved observations into a bounded, crash-resumable SQLite ledger.</purpose>
<non-goals><item>Does not load the full quarter into memory.</item></non-goals>
</MODULE_CONTRACT>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import Database from "better-sqlite3";
import {
  loadSigningKeyFromEnv,
  signObservation,
  type SigningKeyConfig,
} from "@syrokomskyi/observatory-crypto";
import type { Observation } from "@syrokomskyi/observatory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type { IngestedObs, PipelineContext } from "../pipeline/types.js";

export class SignBundleGogol extends Gogol {
  override readonly id = "sign-bundle";

  override async run(ctx: PipelineContext): Promise<void> {
    const dbPath = ctx.state.observationDbPath;
    if (!dbPath) throw new Error("No resolved observation store");
    const result = signResolvedObservations(dbPath);
    ctx.state.signedObservationDbPath = dbPath;
    console.log(
      `[sign-bundle] Signed ${result.signedNow} new observations; complete ledger uses key ${result.signingKeyId}`,
    );
  }
}

export const signResolvedObservations = (
  dbPath: string,
  key: SigningKeyConfig = loadSigningKeyFromEnv(),
): { signedNow: number; signedTotal: number; signingKeyId: string } => {
    const db = new Database(dbPath);
    let signedNow = 0;
    try {
      const integrity = db.pragma("quick_check") as Array<{ quick_check: string }>;
      if (integrity.some((row) => row.quick_check !== "ok")) {
        throw new Error("Observation store failed quick_check before signing");
      }
      const existingKey = db
        .prepare("SELECT value FROM translation_meta WHERE key = 'signing_key_id'")
        .get() as { value: string } | undefined;
      if (existingKey && existingKey.value !== key.signingKeyId) {
        throw new Error(
          `Signing key changed inside capsule: expected ${existingKey.value}, found ${key.signingKeyId}`,
        );
      }
      db.prepare(
        `INSERT INTO translation_meta(key, value) VALUES ('signing_key_id', ?)
         ON CONFLICT(key) DO NOTHING`,
      ).run(key.signingKeyId);
      db.exec(`
        CREATE TABLE IF NOT EXISTS signed_observations (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          observation_id TEXT NOT NULL UNIQUE,
          payload_json TEXT NOT NULL
        );
      `);
      const selectUnsigned = db.prepare(`
        SELECT r.observation_id, r.payload_json
        FROM resolved_observations r
        LEFT JOIN signed_observations s ON s.observation_id = r.observation_id
        WHERE s.observation_id IS NULL AND r.observation_id > ?
        ORDER BY r.observation_id
        LIMIT 10000
      `);
      const insert = db.prepare(
        "INSERT INTO signed_observations(observation_id, payload_json) VALUES (?, ?)",
      );
      let lastObservationId = "";
      while (true) {
        const rows = selectUnsigned.all(lastObservationId) as Array<{
          observation_id: string;
          payload_json: string;
        }>;
        if (rows.length === 0) break;
        db.exec("BEGIN IMMEDIATE");
        try {
          for (const row of rows) {
            const { _device_id, ...observation } = JSON.parse(row.payload_json) as IngestedObs;
            void _device_id;
            const signed = signObservation(observation as Observation, key);
            insert.run(row.observation_id, JSON.stringify(signed));
            signedNow++;
            lastObservationId = row.observation_id;
          }
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
      const counts = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM resolved_observations) AS resolved,
          (SELECT COUNT(*) FROM signed_observations) AS signed,
          (SELECT COALESCE(MAX(seq), 0) FROM signed_observations) AS max_seq
      `).get() as { resolved: number; signed: number; max_seq: number };
      if (counts.resolved === 0 || counts.signed !== counts.resolved || counts.max_seq !== counts.signed) {
        throw new Error(
          `Signed observation closure mismatch: resolved=${counts.resolved}, signed=${counts.signed}, max_seq=${counts.max_seq}`,
        );
      }
      return { signedNow, signedTotal: counts.signed, signingKeyId: key.signingKeyId };
    } finally {
      db.close();
    }
};
