/*
<MODULE_CONTRACT>
<purpose>Signs resolved observations as a bounded NDJSON stream.</purpose>
<non-goals><item>Does not load the full quarter into memory.</item></non-goals>
</MODULE_CONTRACT>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import Database from "better-sqlite3";
import fsp from "node:fs/promises";
import path from "node:path";
import { loadSigningKeyFromEnv, signObservation } from "@syrokomskyi/observatory-crypto";
import type { Observation } from "@syrokomskyi/observatory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type { IngestedObs, PipelineContext } from "../pipeline/types.js";

export class SignBundleGogol extends Gogol {
  override readonly id = "sign-bundle";

  override async run(ctx: PipelineContext): Promise<void> {
    const dbPath = ctx.state.observationDbPath;
    if (!dbPath) throw new Error("No resolved observation store");
    const signedNdjsonPath = path.join(ctx.outputDir, "signed-observations.ndjson");
    const key = loadSigningKeyFromEnv();
    const db = new Database(dbPath, { readonly: true });
    const output = await fsp.open(signedNdjsonPath, "w");
    let count = 0;
    try {
      const rows = db.prepare(`SELECT payload_json FROM resolved_observations`).iterate() as IterableIterator<{
        payload_json: string;
      }>;
      for (const row of rows) {
        const { _device_id, ...observation } = JSON.parse(row.payload_json) as IngestedObs;
        void _device_id;
        const signed = signObservation(observation as Observation, key);
        await output.write(`${JSON.stringify(signed)}\n`);
        count++;
      }
      await output.sync();
    } finally {
      await output.close();
      db.close();
    }
    if (count === 0) throw new Error("No observations to sign");
    ctx.state.signedNdjsonPath = signedNdjsonPath;
    console.log(`[sign-bundle] Signed ${count} observations with key ${key.signingKeyId}`);
  }
}
