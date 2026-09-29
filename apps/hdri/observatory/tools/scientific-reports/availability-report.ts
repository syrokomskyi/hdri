/*
<MODULE_CONTRACT>
<purpose>Generate an availability report by rereading every signed liveness target and selected CAS result.</purpose>
<non-goals><item>Does not estimate attrition, authenticate caller key authority, complete disclosure review or grant publication admission.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>All four outcomes remain in the sealed-target denominator; fingerprints bind consumed evidence, policy and verification keys rather than paths.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: replace guessed JSON liveness/frame inputs with executable authenticated evidence derivation.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import { capsuleConfigSha256, loadVerifiedQuarterExecution, validateCapsule,
  type QuarterCapsule, type HdriPeriod } from "@syrokomskyi/factory-core";
import { loadVerificationKeys } from "@syrokomskyi/observatory-crypto";
import { deriveAvailabilityCandidate } from "../../run/release/availability-candidate";
import { computeInputFingerprint, requireArg, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const capsuleDir = await fs.realpath(path.resolve(requireArg("--capsule-dir")));
const keysDir = await fs.realpath(path.resolve(requireArg("--keys-dir")));
const policyPath = path.resolve(requireArg("--policy"));
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const manifestPath = path.join(capsuleDir, "capsule-staging.json");
const manifestBytes = await fs.readFile(manifestPath);
const capsule = JSON.parse(manifestBytes.toString("utf8")) as QuarterCapsule;
validateCapsule(capsule);
if (capsule.period !== period || capsule.capsuleId !== capsuleId || !capsule.deviceId)
  throw new Error("AVAILABILITY_REPORT_SCOPE_MISMATCH");
const policyBytes = await fs.readFile(policyPath);
const policy = parse(policyBytes.toString("utf8"));
if (!policy || !Number.isSafeInteger(policy.default_k) || policy.default_k < 1 ||
  !Number.isSafeInteger(policy.hard_floor) || policy.hard_floor < 1 || typeof policy.high_risk_release !== "boolean")
  throw new Error("AVAILABILITY_REPORT_POLICY_INVALID");
const effectiveK = policy.high_risk_release ? policy.default_k : Math.max(policy.default_k, policy.hard_floor);
const keys = await loadVerificationKeys(keysDir);
if (!keys.size) throw new Error("AVAILABILITY_VERIFICATION_KEYS_MISSING");
const keysSha256 = digest(JSON.stringify([...keys].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([keyId, key]) => ({ keyId, collectorId: key.collectorId, publicKeyPem: key.publicKeyPem }))));
const execution = await loadVerifiedQuarterExecution(capsuleDir, ["liveness"], keys);
if (execution.capsuleConfigSha256 !== capsuleConfigSha256(period as HdriPeriod, capsuleId, capsule.instrumentPlan))
  throw new Error("AVAILABILITY_CAPSULE_CONFIG_MISMATCH");
const candidate = await deriveAvailabilityCandidate(capsuleDir, execution,
  { period, capsuleId, deviceId: capsule.deviceId }, effectiveK);
if (digest(await fs.readFile(manifestPath)) !== digest(manifestBytes) ||
  digest(await fs.readFile(policyPath)) !== digest(policyBytes)) throw new Error("AVAILABILITY_REPORT_INPUT_CHANGED");
const policySha256 = digest(policyBytes);
const candidateSha256 = digest(`${JSON.stringify({ ...candidate, policySha256,
  keyAuthority: "explicit-caller-supplied-keys-not-publication-admission" }, null, 2)}\n`);
const bindings = { capsuleStagingSha256: digest(manifestBytes), policySha256, keysSha256,
  candidateSha256, ...candidate.source };
const status = candidate.cellPrivacy.violations.length === 0 ? "pass" : "fail";
await writeReport("availability", "availability.json", evidenceDir, period, capsuleId,
  computeInputFingerprint("hdri-availability-evidence-report@1", period, capsuleId, JSON.stringify(bindings)),
  status, candidate.cellPrivacy.violations,
  ["measured_targets_only_not_population_or_attrition", "key_authority_requires_independent_admission",
    "cell_privacy_is_not_complete_disclosure_review"], [],
  { evidenceSchema: "hdri-availability-evidence-report@1", bindings, denominator: candidate.denominator,
    outcomePolicy: candidate.outcomePolicy, n: candidate.n, counts: candidate.counts,
    reachableShareOfTargets: candidate.reachableShareOfTargets, effectiveK });
if (status !== "pass") process.exitCode = 1;
