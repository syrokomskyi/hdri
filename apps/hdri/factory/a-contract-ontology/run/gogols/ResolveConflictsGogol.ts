/*
<MODULE_CONTRACT>
<purpose>Resolves observation conflicts using last-writer-wins per (asset_id, signal_path) — this module handles resolve conflicts operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not translate or sign observations.</item>
  <item>Do not emit bundles.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from monolithic main.ts as part of pipeline conversion.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import fsp from "node:fs/promises";
import path from "node:path";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext, IngestedObs } from "../pipeline/types.js";
import { evidenceDir } from "../config.js";

export class ResolveConflictsGogol extends Gogol {
  override readonly id = "resolve-conflicts";

  override async run(ctx: PipelineContext): Promise<void> {
    const { allObs } = ctx.state;
    if (allObs.length === 0)
      throw new Error("No observations to resolve — run translate-ontology first");

    const winnerByKey = new Map<string, IngestedObs>();
    const conflicts: Array<{
      key: string;
      winner_device: string;
      winner_observed_at: string;
      loser_device: string;
      loser_observed_at: string;
      loser_value: unknown;
    }> = [];

    for (const obs of allObs) {
      const key = `${obs.asset_id}\x00${obs.signal_path}`;
      const existing = winnerByKey.get(key);
      if (!existing) {
        winnerByKey.set(key, obs);
        continue;
      }

      const a = existing.recorded_at;
      const b = obs.recorded_at;
      let challengerWins: boolean;
      if (a !== b) challengerWins = b > a;
      else challengerWins = obs._device_id > existing._device_id;

      const winner = challengerWins ? obs : existing;
      const loser = challengerWins ? existing : obs;
      winnerByKey.set(key, winner);

      conflicts.push({
        key,
        winner_device: winner._device_id,
        winner_observed_at: winner.observed_at,
        loser_device: loser._device_id,
        loser_observed_at: loser.observed_at,
        loser_value: loser.value_bool ?? loser.value_num ?? loser.value_str ?? loser.value_json,
      });
    }

    console.log(
      `[resolve-conflicts] ${winnerByKey.size} unique observations after LWW; ${conflicts.length} conflicts logged.`,
    );

    if (conflicts.length > 0) {
      await fsp.mkdir(evidenceDir, { recursive: true });
      const conflictNdjson = conflicts.map((c) => JSON.stringify(c)).join("\n") + "\n";
      await fsp.writeFile(path.join(evidenceDir, "conflict-log.ndjson"), conflictNdjson, "utf-8");
    }

    ctx.state.resolvedObs = [...winnerByKey.values()];
  }
}
