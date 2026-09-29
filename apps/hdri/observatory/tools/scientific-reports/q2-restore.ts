/*
<MODULE_CONTRACT>
<purpose>Write q2-restore QC from a pinned completed recovery record, both local archive copies and verified restored signed capsule bytes.</purpose>
<non-goals><item>Does not repeat remote download, open SQLite, certify scientific replay or infer restoration from a marker file.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>The historical report filename is retained; restored period must be the immediate predecessor of the requested quarter.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: replace optional-marker checks with real restored closure and signature verification.</item></CHANGE_SUMMARY>
*/
import path from "node:path";
import { loadVerificationKeys } from "@syrokomskyi/observatory-crypto";
import { verifyRestoredPredecessor } from "../../run/release/restored-predecessor";
import { requireArg, requireCommonArgs, computeInputFingerprint, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const closure = await verifyRestoredPredecessor({
  currentPeriod: period, receiptPath: requireArg("--restore-receipt"),
  receiptSha256: requireArg("--restore-receipt-sha256"), downloadedArchive: path.resolve(requireArg("--downloaded-archive")),
  keys: await loadVerificationKeys(path.resolve(requireArg("--keys-dir"))),
});
await writeReport("q2-restore", "q2-restore.json", evidenceDir, period, capsuleId,
  computeInputFingerprint("hdri-restored-predecessor-check@1", period, capsuleId, JSON.stringify(closure)),
  "pass", [], ["declared_closure_byte_restore_not_scientific_rebuild", "remote_origin_is_a_pinned_execution_record_not_reexecuted",
    "caller_key_and_receipt_authority_require_independent_admission"], [], closure);
