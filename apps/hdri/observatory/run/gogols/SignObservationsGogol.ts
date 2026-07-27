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
    let totalSkipped = 0;

    try {
      const rows = db
        .prepare(
          `SELECT id, obs_json FROM observations WHERE signature IS NULL AND obs_json IS NOT NULL`,
        )
        .all() as UnsignedRow[];

      log.info("unsigned-count", `${rows.length} unsigned observations to sign`, {
        unsignedCount: rows.length,
      });

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        const batchSign = db.transaction(() => {
          let signed = 0;
          let skipped = 0;
          for (const row of batch) {
            let obs: Observation;
            try {
              obs = JSON.parse(row.obs_json) as Observation;
            } catch {
              skipped++;
              continue;
            }
            const signed_obs = signObservation(obs, key);
            updateSig.run(
              signed_obs.signature,
              signed_obs.signed_at,
              signed_obs.signing_key_id,
              signed_obs.collector_id,
              row.id,
            );
            signed++;
          }
          return { signed, skipped };
        });

        const { signed, skipped } = batchSign();
        totalSigned += signed;
        totalSkipped += skipped;

        logProgress(this.id, totalSigned, rows.length, BATCH_SIZE, true);
      }
    } finally {
      db.close();
    }

    log.info(
      "sign-finished",
      `Done. ${totalSigned} signed, ${totalSkipped} skipped (parse errors).`,
      {
        totalSigned,
        totalSkipped,
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
          total_skipped: totalSkipped,
          signed_at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
}
