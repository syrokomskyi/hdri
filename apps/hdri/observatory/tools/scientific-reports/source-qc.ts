/*
<MODULE_CONTRACT>
<purpose>Produce source-qc evidence from a signed source closure and its exact sealed availability target set.</purpose>
<non-goals><item>Does not infer population coverage, parser completeness, classification quality or publication admission.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Report only verified closure facts, never manufactured resolved/conflict counters from incompatible manifests.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: use shared frame signature verification and exact target-set reconciliation for availability-only source QC.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadVerifiedQuarterExecution, validateCapsule, type QuarterCapsule } from "@syrokomskyi/factory-core";
import { loadVerificationKeys } from "@syrokomskyi/observatory-crypto";
import { verifyAvailabilitySource } from "../../run/release/availability-source";
import { computeInputFingerprint, requireArg, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const capsuleDir = await fs.realpath(path.resolve(requireArg("--capsule-dir")));
const keys = await loadVerificationKeys(await fs.realpath(path.resolve(requireArg("--keys-dir"))));
if (!keys.size) throw new Error("SOURCE_QC_KEYS_MISSING");
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const manifestPath = path.join(capsuleDir, "capsule-staging.json");
const bytes = await fs.readFile(manifestPath);
const capsule = JSON.parse(bytes.toString("utf8")) as QuarterCapsule;
validateCapsule(capsule);
if (capsule.period !== period || capsule.capsuleId !== capsuleId || !capsule.deviceId)
  throw new Error("SOURCE_QC_SCOPE_MISMATCH");
const execution = await loadVerifiedQuarterExecution(capsuleDir, ["liveness"], keys);
const closure = await verifyAvailabilitySource(capsuleDir, capsule, execution, keys);
if (digest(await fs.readFile(manifestPath)) !== digest(bytes)) throw new Error("SOURCE_QC_INPUT_CHANGED");
const keysSha256 = digest(JSON.stringify([...keys].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([keyId, key]) => ({ keyId, collectorId: key.collectorId, publicKeyPem: key.publicKeyPem }))));
const bindings = { capsuleStagingSha256: digest(bytes), keysSha256, ...closure };
await writeReport("source-qc", "source-qc.json", evidenceDir, period, capsuleId,
  computeInputFingerprint("hdri-availability-source-closure@1", period, capsuleId, JSON.stringify(bindings)),
  "pass", [], ["availability_source_closure_only_not_population_or_parser_completeness",
    "key_authority_requires_independent_admission"], [], { applicability: ["availability"], ...bindings });
