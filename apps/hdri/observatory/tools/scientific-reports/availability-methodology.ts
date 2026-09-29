/*
<MODULE_CONTRACT>
<purpose>Write an availability-only methodology snapshot after verifying an explicitly pinned retained runtime kit.</purpose>
<non-goals><item>Does not execute reconstruction, sign source provenance or grant publication admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115: expose exact availability source/runtime/policy closure without fabricating score-methodology fields.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { verifyAvailabilityMethodology } from "../../run/release/availability-methodology";
import { requireArg, requireCommonArgs, computeInputFingerprint, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const policyPath = path.resolve(requireArg("--policy"));
const policySha256 = createHash("sha256").update(await fs.readFile(policyPath)).digest("hex");
const closure = await verifyAvailabilityMethodology({
  manifestPath: requireArg("--runtime-manifest"), expectedManifestSha256: requireArg("--runtime-manifest-sha256"),
  policySha256, period, capsuleId,
});
if (createHash("sha256").update(await fs.readFile(policyPath)).digest("hex") !== policySha256)
  throw new Error("METHODOLOGY_POLICY_CHANGED");
await writeReport("methodology-snapshot", "methodology-snapshot.json", evidenceDir, period, capsuleId,
  computeInputFingerprint("hdri-availability-methodology@1", period, capsuleId, JSON.stringify(closure)),
  "pass", [], ["runtime_bytes_verified_not_reexecution_or_image_inspection",
    "explicit_manifest_pin_requires_independent_admission", "not_score_or_cross_quarter_methodology"], [], closure);
