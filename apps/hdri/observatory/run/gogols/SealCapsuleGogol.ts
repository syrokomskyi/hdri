/*
<MODULE_CONTRACT>
<purpose>Seals the capsule candidate: transitions state from candidate to sealed and signs the capsule manifest.</purpose>
<non-goals>
  <item>Does not validate scientific gates — use ValidateQuarterGogol.</item>
  <item>Does not publish or replicate — use ReleaseQuarterGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0031: new gogol for technical capsule closure (seal step).</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import fs from "node:fs/promises";
import path from "node:path";
import { sealQuarterCapsule, type QuarterCapsule } from "@syrokomskyi/factory-core";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";

export class SealCapsuleGogol extends Gogol {
  override readonly id = "seal-capsule";

  override async run(ctx: PipelineContext): Promise<void> {
    const { capsuleDir } = ctx.state;
    if (!capsuleDir) throw new Error("SealCapsuleGogol requires capsuleDir in pipeline state");

    const manifestPath = path.join(capsuleDir, "capsule-manifest.json");
    try {
      await fs.access(manifestPath);
      ctx.state.candidateManifestPath = manifestPath;
      return;
    } catch {
      // not sealed yet — proceed
    }

    const candidatePath = path.join(capsuleDir, "capsule-candidate.json");
    const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8")) as QuarterCapsule;
    if (candidate.state !== "candidate") {
      throw new Error(`Expected capsule-candidate.json with state "candidate", got "${candidate.state}"`);
    }

    const sealed: QuarterCapsule = { ...candidate, state: "sealed" };
    await sealQuarterCapsule(capsuleDir, sealed);
    ctx.state.candidateManifestPath = manifestPath;
  }
}
