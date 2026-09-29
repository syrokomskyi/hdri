/*
<MODULE_CONTRACT>
<purpose>Write an availability-only scientific reconciliation report from explicitly pinned completed comparison evidence.</purpose>
<non-goals><item>Does not repeat collection or comparison, authenticate pin authority, or admit a release.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Record retained-record verification honestly and bind every consumed file by SHA-256.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: add availability reconciliation report without score-file assumptions.</item></CHANGE_SUMMARY>
*/
import { verifyRetainedAvailabilityReconciliation } from "../../run/release/retained-availability-reconciliation";
import { computeInputFingerprint, requireArg, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const pinned = (name: string) => ({ path: requireArg(`--${name}`), sha256: requireArg(`--${name}-sha256`) });
const result = await verifyRetainedAvailabilityReconciliation({
  period, capsuleId,
  candidate: pinned("candidate"),
  comparison: pinned("comparison"),
  bundleManifest: pinned("bundle-manifest"),
  policy: pinned("policy"),
});
await writeReport("reconciliation", "reconciliation.json", evidenceDir, period, capsuleId,
  computeInputFingerprint(result.evidenceSchema, period, capsuleId, JSON.stringify(result.bindings)),
  "pass", [], ["retained_comparison_not_fresh_execution", "pin_provenance_requires_independent_admission",
    "non_availability_signals_not_authenticated_by_this_report"], [], result);
