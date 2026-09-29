/*
<MODULE_CONTRACT>
<purpose>Compute the sealed-manifest digest that a candidate must reproduce before the final seal exists.</purpose>
<non-goals><item>Does not write a manifest, sign a capsule, verify artifacts or grant release admission.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Bind pre-seal reconstruction to the final writer's exact bytes, including its sealed state; never relax post-seal byte checks.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: keep reconstruction and validation bindings stable across the candidate-to-sealed transition.</item></CHANGE_SUMMARY>
*/
import { createHash } from "node:crypto";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";

/** Must match sealQuarterCapsule's serialization; an actual-writer integration test pins it. */
export function expectedSealedManifestSha256(capsule: QuarterCapsule): string {
  if (capsule.state !== "candidate" && capsule.state !== "sealed")
    throw new Error("REBUILD_REQUIRES_CANDIDATE_OR_SEALED_CAPSULE");
  return createHash("sha256").update(`${JSON.stringify({ ...capsule, state: "sealed" }, null, 2)}\n`).digest("hex");
}
