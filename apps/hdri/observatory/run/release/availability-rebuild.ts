/*
<MODULE_CONTRACT><purpose>Bind retained offline availability replay to the current capsule and independently reconstructed public descriptor.</purpose><non-goals><item>Does not rerun collection, claim a fresh container execution or establish external key authority.</item></non-goals></MODULE_CONTRACT>
<KEY_DECISIONS><item>A distinct receipt schema records retained replay reuse; every consumed control is bound to the capsule inventory and every public byte is reproduced.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: qualify availability-only reconstruction without a score vault.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { serializeReconciledAvailabilityPreview } from "./availability-preview";
import { reviewAvailabilityDisclosure } from "./availability-disclosure";
import { verifyPublicationClosure } from "./publication-closure";
import { expectedSealedManifestSha256 } from "./sealed-manifest-digest";
import { verifyAvailabilityMethodology } from "./availability-methodology";
import { canonicalize } from "@syrokomskyi/observatory-crypto";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
/** Caller must additionally verify complete raw capsule bytes, signatures and scientific admission. */
export async function deriveAvailabilityRebuildReceipt(capsuleDir: string, capsule: QuarterCapsule) {
  if (capsule.releaseProfile !== "availability-only@1") throw new Error("AVAILABILITY_REBUILD_PROFILE_REQUIRED");
  async function read(uri: string) {
    const matches = capsule.artifacts.filter(item => item.uri === uri);
    if (matches.length !== 1) throw new Error(`REBUILD_ARTIFACT_MISSING_OR_DUPLICATE:${uri}`);
    const artifact = matches[0]!;
    const file = path.join(capsuleDir, uri);
    const handle = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size !== artifact.bytes || before.size > 4 * 1024 * 1024)
        throw new Error(`REBUILD_ARTIFACT_SIZE:${uri}`);
      const bytes = await handle.readFile();
      const after = await handle.stat();
      if (hash(bytes) !== artifact.sha256 || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs)
        throw new Error(`REBUILD_ARTIFACT_DIGEST:${uri}`);
      return bytes.toString("utf8");
    } finally { await handle.close(); }
  }
  const runtimeRoot = "artifacts/methodology/offline-runtime/";
  const runtimeBytes = await read(`${runtimeRoot}runtime-kit-manifest.json`);
  const runtime = JSON.parse(runtimeBytes);
  if (runtime.schema !== "hdri-offline-runtime-kit@1" || runtime.period !== capsule.period ||
    runtime.capsuleId !== capsule.capsuleId || !Array.isArray(runtime.files) ||
    !Array.isArray(runtime.containers) || runtime.containers.length !== 4)
    throw new Error("REBUILD_RUNTIME_SCOPE_INVALID");
  const listed = new Set<string>();
  for (const file of runtime.files) {
    const retained = capsule.artifacts.find(item => item.uri === `${runtimeRoot}${file.path}`);
    if (typeof file.path !== "string" || listed.has(file.path) || !retained ||
      retained.bytes !== file.bytes || retained.sha256 !== file.sha256)
      throw new Error("REBUILD_RUNTIME_INVENTORY_MISMATCH");
    listed.add(file.path);
  }
  const candidateBytes = await read("artifacts/qc/availability/candidate.json");
  const comparisonBytes = await read("artifacts/qc/availability/comparison.json");
  const policyBytes = await read("artifacts/methodology/k-anon-policy-v1.yaml");
  const methodology = await verifyAvailabilityMethodology({ manifestPath: path.join(capsuleDir, runtimeRoot, "runtime-kit-manifest.json"),
    expectedManifestSha256: hash(runtimeBytes), policySha256: hash(policyBytes), period: capsule.period, capsuleId: capsule.capsuleId });
  const methodologyBytes = await read("artifacts/qc/release/methodology-snapshot.json");
  const methodologyReport = JSON.parse(methodologyBytes);
  if (methodologyReport.status !== "pass" || methodologyReport.period !== capsule.period || methodologyReport.capsuleId !== capsule.capsuleId ||
    Object.entries(methodology).some(([key, value]) => canonicalize(methodologyReport[key] ?? null) !== canonicalize(value)))
    throw new Error("REBUILD_METHODOLOGY_REPORT_MISMATCH");
  if (hash(await read(`${runtimeRoot}policies/k-anon-policy-v1.yaml`)) !== hash(policyBytes))
    throw new Error("REBUILD_POLICY_MISMATCH");
  const candidate = JSON.parse(candidateBytes);
  const comparison = JSON.parse(comparisonBytes);
  const policy = parse(policyBytes);
  if (candidate.period !== capsule.period || candidate.capsuleId !== capsule.capsuleId || candidate.deviceId !== capsule.deviceId ||
    !Number.isSafeInteger(policy?.default_k) || policy.default_k < 1 || !Number.isSafeInteger(policy.hard_floor) ||
    policy.hard_floor < 1 || typeof policy.high_risk_release !== "boolean") throw new Error("REBUILD_INPUT_SCOPE_INVALID");
  const k = policy.high_risk_release ? policy.default_k : Math.max(policy.default_k, policy.hard_floor);
  const preview = serializeReconciledAvailabilityPreview(candidate, comparison, k, hash(policyBytes));
  const files = (["json", "csv"] as const).map(format => ({ name: `availability.${format}`,
    sha256: hash(preview[format]), bytes: Buffer.byteLength(preview[format]) }));
  const previewManifest = serialize({ schema: "hdri-availability-preview@1", status: preview.status, schemaId: preview.schemaId,
    candidateSha256: hash(candidateBytes), reconciliationSha256: hash(comparisonBytes), policySha256: hash(policyBytes), effectiveK: k, files,
    limitations: ["Caller-selected report hashes establish byte identity, not trusted provenance or publication admission.",
      "Local small-cell checks are not complete disclosure review.", "CSV must retain its accompanying JSON interpretation and preview manifest."] });
  const disclosure = serialize({ ...reviewAvailabilityDisclosure(preview.json, preview.csv, capsule.period, k),
    previewManifestSha256: hash(previewManifest), policySha256: hash(policyBytes) });
  const commandNames = { prepare: "candidate", reconcile: "reconciliation", preview: "preview", disclosure: "disclosure" } as const;
  const expectedHashes = { prepare: hash(candidateBytes), reconcile: hash(comparisonBytes), preview: hash(previewManifest), disclosure: hash(disclosure) };
  const expectedCommands = {
    prepare: ["node", "/runtime/prepare-availability.mjs", "--capsule-dir", "/capsule", "--keys-dir", "/keys"],
    reconcile: ["node", "/runtime/reconcile-availability.mjs", "--capsule-dir", "/capsule", "--keys-dir", "/keys"],
    preview: ["node", "/runtime/prepare-availability-preview.mjs", "--candidate",
      `/work/.output/availability-candidates/${capsule.period}/${capsule.capsuleId}/${hash(candidateBytes)}.json`,
      "--reconciliation", `/work/.output/availability-reconciliation/${capsule.period}/${capsule.capsuleId}/${hash(comparisonBytes)}.json`,
      "--policy", "/work/policies/k-anon-policy-v1.yaml"],
    disclosure: ["node", "/runtime/review-availability-preview.mjs", "--preview-dir",
      `/work/.output/availability-previews/${hash(previewManifest)}`, "--period", capsule.period,
      "--policy", "/work/policies/k-anon-policy-v1.yaml"],
  };
  const seen = new Set<string>();
  let startedAt = "", completedAt = "";
  for (const container of runtime.containers) {
    const stage = container.stage as keyof typeof commandNames;
    if (!Object.hasOwn(commandNames, stage) || seen.has(stage)) throw new Error("REBUILD_REPLAY_STAGE_INVALID");
    seen.add(stage);
    if (JSON.stringify(container.command) !== JSON.stringify(expectedCommands[stage]) ||
      !listed.has(`evidence/${commandNames[stage]}-command.json`)) throw new Error("REBUILD_REPLAY_COMMAND_INVALID");
    const command = JSON.parse(await read(`${runtimeRoot}evidence/${commandNames[stage]}-command.json`));
    if ((stage === "preview" ? command.manifestSha256 : command.sha256) !== expectedHashes[stage])
      throw new Error("REBUILD_REPLAY_OUTPUT_MISMATCH");
    if (container.image !== runtime.image || !/^sha256:[a-f0-9]{64}$/.test(runtime.image) ||
      container.network !== "none" || container.readonlyRootfs !== true ||
      !container.capDrop?.includes("ALL") || !container.securityOpt?.includes("no-new-privileges") ||
      container.state?.Status !== "exited" || container.state.ExitCode !== 0 || container.state.OOMKilled !== false ||
      container.state.Error !== "" || !Array.isArray(container.mounts) || container.mounts.length !== 5)
      throw new Error("REBUILD_REPLAY_ISOLATION_INVALID");
    const mounts = new Set<string>();
    for (const mount of container.mounts) {
      if (!["/work", "/work/policies", "/runtime", "/capsule", "/keys"].includes(mount.destination) ||
        mounts.has(mount.destination) || mount.writable !== (mount.destination === "/work"))
        throw new Error("REBUILD_REPLAY_MOUNT_INVALID");
      mounts.add(mount.destination);
    }
    const start = container.state.StartedAt, end = container.state.FinishedAt;
    if (typeof start !== "string" || typeof end !== "string" || !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) || Date.parse(end) < Date.parse(start)) throw new Error("REBUILD_REPLAY_TIME_INVALID");
    if (!startedAt || Date.parse(start) < Date.parse(startedAt)) startedAt = start;
    if (!completedAt || Date.parse(end) > Date.parse(completedAt)) completedAt = end;
  }
  // Reconstruct descriptor independently; do not copy expected manifest fields.
  const rebuiltManifest = serialize({ schema: "hdri-public-manifest@1", period: capsule.period, capsuleId: capsule.capsuleId,
    products: (["json", "csv"] as const).map(format => ({ schema: "hdri-public-product@1", product: "availability", format,
      contentSha256: hash(preview[format]), bytes: Buffer.byteLength(preview[format]), policySha256: hash(policyBytes),
      schemaId: "hdri-public-availability@2", sourceAggregateSha256: hash(candidateBytes) })),
    policyDigest: hash(policyBytes), kAnonymityMin: k });
  if (await read("artifacts/publication/public-manifest.json") !== rebuiltManifest ||
    await read("artifacts/publication/availability.json") !== preview.json ||
    await read("artifacts/publication/availability.csv") !== preview.csv)
    throw new Error("REBUILD_PUBLIC_BYTES_MISMATCH");
  await verifyPublicationClosure(capsuleDir, capsule, path.join(capsuleDir, "artifacts/publication/public-manifest.json"));
  return {
    schema: "hdri-availability-rebuild@1" as const,
    verificationMode: "retained-offline-data-replay-with-current-descriptor-reconstruction" as const,
    capsuleManifestSha256: expectedSealedManifestSha256(capsule),
    methodologySha256: hash(methodologyBytes),
    runtimeClosureSha256: hash(runtimeBytes),
    rebuiltPublicManifestSha256: hash(rebuiltManifest), expectedPublicManifestSha256: hash(rebuiltManifest),
    inputClosureSha256: hash(serialize({ candidate: hash(candidateBytes), comparison: hash(comparisonBytes), policy: hash(policyBytes) })),
    comparisonReportSha256: hash(comparisonBytes), isolationProofSha256: hash(runtimeBytes), startedAt, completedAt,
    limitations: ["Retained same-host container records, not a fresh replay or independent time attestation.",
      "The public descriptor is reconstructed now from byte-matched replay outputs.",
      "Raw closure, trusted signatures, disclosure history and custody require separate admission."],
  };
}

export async function verifyAvailabilityRebuildReceipt(capsuleDir: string, capsule: QuarterCapsule, receipt: unknown) {
  if (canonicalize(receipt) !== canonicalize(await deriveAvailabilityRebuildReceipt(capsuleDir, capsule)))
    throw new Error("AVAILABILITY_REBUILD_RECEIPT_MISMATCH");
}
