/*
<MODULE_CONTRACT>
<purpose>Signs unsigned observations in the observatory DB using the ed25519 signing key,
producing tamper-evident records for vault export and public transparency.</purpose>
<non-goals>
  <item>Does not verify existing signatures — use the verify-vault harness for that.</item>
  <item>Does not write to vault — that is a future gogol in the publish phase.</item>
  <item>Does not generate the signing key — operators run `pnpm setup:device-id` once.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation (P0.2.9): sign unsigned observations before vault export.</item>
  <item>Replace per-batch console.log with single-line logProgress from @syrokomskyi/utils.</item>
  <item>Replace raw console.log with structured NDJSON logger from @syrokomskyi/pipeline-core.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import path from "node:path";
import { loadSigningKeyFromEnv, signObservation } from "@syrokomskyi/observatory-crypto";
import type { Observation } from "@syrokomskyi/observatory-core";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { logProgress } from "@syrokomskyi/utils";
import { createJsonLogger } from "@syrokomskyi/pipeline-core";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { openObservatoryDb } from "../db/connection";

const BATCH_SIZE = 1000;

type UnsignedRow = {
  id: string;
  obs_json: string;
};

export class SignObservationsGogol extends Gogol {
  override readonly id = "sign-observations";

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error("Missing run_id — setup-observatory-run must run first");
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const year = parsePeriod(ctx.state.brief.period).year;
    const log = createJsonLogger({
      app: "observatory",
      pipeline: "observatory",
    }).withContext({ gogol: this.id });

    let key;
    try {
      key = loadSigningKeyFromEnv();
    } catch (err) {
      throw new Error(
        `[sign-observations] Cannot load signing key from DEVICE_SIGNING_KEY env: ${err instanceof Error ? err.message : String(err)}\n` +
          `Run 'pnpm setup:device-id' at the repo root to provision one.`,
        { cause: err },
      );
    }

    log.info(
      "signing-key-loaded",
      `Signing key: ${key.signingKeyId} collector=${key.collectorId}`,
      {
        signingKeyId: key.signingKeyId,
        collectorId: key.collectorId,
      },
    );

    const db = openObservatoryDb(year);

    const updateSig = db.prepare(`
      UPDATE observations
      SET signature = ?, signed_at = ?, signing_key_id = ?, collector_id = ?
      WHERE id = ?
    `);

    let totalSigned = 0;
    const runId = ctx.state.runId!;

    try {
      const existingKeyIds = db
        .prepare(
          `SELECT DISTINCT signing_key_id FROM observations
           WHERE run_id = ? AND signature IS NOT NULL`,
        )
        .pluck()
        .all(runId) as string[];
      if (existingKeyIds.some((keyId) => keyId !== key.signingKeyId)) {
        throw new Error("Signing key changed inside one Observatory quarter run");
      }
      const unsignedCount = (
        db.prepare(
          `SELECT COUNT(*) AS n FROM observations
           WHERE run_id = ? AND signature IS NULL AND obs_json IS NOT NULL`,
        ).get(runId) as { n: number }
      ).n;
      log.info("unsigned-count", `${unsignedCount} unsigned observations to sign`, {
        unsignedCount,
      });
      const selectBatch = db.prepare(`
        SELECT id, obs_json FROM observations
        WHERE run_id = ? AND signature IS NULL AND obs_json IS NOT NULL AND id > ?
        ORDER BY id LIMIT ?
      `);
      let lastId = "";
      while (true) {
        const batch = selectBatch.all(runId, lastId, BATCH_SIZE) as UnsignedRow[];
        if (batch.length === 0) break;

        const batchSign = db.transaction(() => {
          let signed = 0;
          for (const row of batch) {
            const obs = JSON.parse(row.obs_json) as Observation;
            const signed_obs = signObservation(obs, key);
            updateSig.run(
              signed_obs.signature,
              signed_obs.signed_at,
              signed_obs.signing_key_id,
              signed_obs.collector_id,
              row.id,
            );
            signed++;
            lastId = row.id;
          }
          return signed;
        });

        totalSigned += batchSign();

        logProgress(this.id, totalSigned, unsignedCount, BATCH_SIZE, true);
      }
      const remaining = (
        db.prepare(
          `SELECT COUNT(*) AS n FROM observations
           WHERE run_id = ? AND signature IS NULL AND obs_json IS NOT NULL`,
        ).get(runId) as { n: number }
      ).n;
      if (remaining !== 0) throw new Error(`Unsigned observation closure is incomplete: ${remaining}`);
    } finally {
      db.close();
    }

    log.info(
      "sign-finished",
      `Done. ${totalSigned} observations signed.`,
      {
        totalSigned,
      },
    );

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, "sign-report.json"),
      JSON.stringify(
        {
          observatory_run_id: ctx.state.runId,
          signing_key_id: key.signingKeyId,
          collector_id: key.collectorId,
          total_signed: totalSigned,
          total_skipped: 0,
          signed_at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
}
