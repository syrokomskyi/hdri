/*
<MODULE_CONTRACT>
<purpose>Verify derived-score evidence and exact artifact bindings before operational admission and custody.</purpose>
<non-goals><item>Does not publish, sign, replace source capsule validation or certify unknown auxiliary disclosure information.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>New scientific reports and offline reconstruction belong to the derivation; only unchanged predecessor restoration is reused from the signed source.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>Unified HDRI: enforce the derived release evidence boundary without applying the source availability product scope.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { validateCapsule, verifyQuarterCapsuleSignature, type QuarterCapsule, type CapsuleArtifact } from "@syrokomskyi/factory-core";
import { readScientificReports, requiredRetainedScientificReports, sha256File } from "./release-contract";
import { verifyPublicationClosure } from "./publication-closure";
import { decodeDashboardCrossSection } from "../../tools/dashboard-cross-section";
import type { DerivedScoreCandidate } from "./derived-score-release";

export async function verifyDerivedScoreEvidence(
  directory: string, candidateSha256: string,
  verificationKey: Parameters<typeof verifyQuarterCapsuleSignature>[2],
) {
  const root = await fs.realpath(directory);
  const read = async (uri: string) => JSON.parse(await fs.readFile(path.join(root, uri), "utf8"));
  const candidatePath = path.join(root, "derived-score-candidate.json");
  if (!/^[a-f0-9]{64}$/.test(candidateSha256) || await sha256File(candidatePath) !== candidateSha256)
    throw new Error("DERIVED_CANDIDATE_PIN_MISMATCH");
  const candidate = await read("derived-score-candidate.json") as DerivedScoreCandidate;
  if (candidate.schema !== "hdri-derived-score-candidate@1" || candidate.state !== "candidate" ||
    !candidate.releaseId || candidate.releaseId === candidate.source.capsuleId ||
    JSON.stringify(candidate.requestedProducts) !== '["cross-section"]') throw new Error("DERIVED_CANDIDATE_INVALID");
  const source = await read("source-capsule-manifest.json") as QuarterCapsule;
  const signature = await read("source-capsule-signature.json");
  validateCapsule(source);
  if (source.state !== "sealed" || source.period !== candidate.period || source.capsuleId !== candidate.source.capsuleId ||
    await sha256File(path.join(root, "source-capsule-manifest.json")) !== candidate.source.manifestSha256 ||
    await sha256File(path.join(root, "source-capsule-signature.json")) !== candidate.source.signatureSha256 ||
    !verifyQuarterCapsuleSignature(source, signature, verificationKey)) throw new Error("DERIVED_SOURCE_INVALID");
  const evidence = await read("derived-evidence-inventory.json");
  if (evidence.schema !== "hdri-derived-evidence-inventory@1" || JSON.stringify(evidence.source) !== JSON.stringify(candidate.source) ||
    !Array.isArray(evidence.artifacts)) throw new Error("DERIVED_EVIDENCE_INVENTORY_INVALID");
  const artifacts: CapsuleArtifact[] = [...candidate.artifacts, ...evidence.artifacts];
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    if (typeof artifact.uri !== "string" || !artifact.uri.startsWith("artifacts/") || artifact.uri.includes("\\") ||
      artifact.uri.split("/").some(p => !p || p === "." || p === "..") || seen.has(artifact.uri) ||
      !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 || !/^[a-f0-9]{64}$/.test(artifact.sha256))
      throw new Error("DERIVED_ARTIFACT_INVALID");
    seen.add(artifact.uri);
    const file = path.join(root, artifact.uri), stat = await fs.lstat(file);
    if (!stat.isFile() || await fs.realpath(file) !== file || stat.size !== artifact.bytes || await sha256File(file) !== artifact.sha256)
      throw new Error("DERIVED_ARTIFACT_BYTES_MISMATCH");
  }
  const scope = { period: candidate.period, capsuleId: candidate.source.capsuleId, artifacts };
  const required = await requiredRetainedScientificReports(root, scope, ["cross-section"]);
  if (JSON.stringify(required.map(([name]) => name)) !== JSON.stringify(candidate.requiredScientificReports) ||
    required.some(([name]) => !seen.has(`artifacts/qc/release/${name}`))) throw new Error("DERIVED_REPORT_INVENTORY_INCOMPLETE");
  const reports = await readScientificReports(path.join(root, "artifacts/qc/release"), scope, ["cross-section"], root);
  const closure = await verifyPublicationClosure(root, scope, path.join(root, "artifacts/publication/public-manifest.json"));
  if (closure.publicManifestSha256 !== candidate.publicManifestSha256) throw new Error("DERIVED_PUBLIC_MANIFEST_CHANGED");
  const publicManifest = await read("artifacts/publication/public-manifest.json");
  const payloads = decodeDashboardCrossSection(await fs.readFile(path.join(root, "artifacts/publication/cross-section.json"), "utf8"), publicManifest.kAnonymityMin);
  if (!seen.has("artifacts/rebuild/rebuild-receipt.json")) throw new Error("DERIVED_REBUILD_MISSING");
  const rebuild = await read("artifacts/rebuild/rebuild-receipt.json");
  if (rebuild.schema !== "hdri-derived-score-rebuild@1" || rebuild.sourceManifestSha256 !== candidate.source.manifestSha256 ||
    rebuild.publicManifestSha256 !== candidate.publicManifestSha256 || rebuild.scoreRecords !== payloads.overview.sampleSize ||
    rebuild.verificationMode !== "isolated-offline-reproduction-of-signed-emitted-inputs" ||
    !Array.isArray(rebuild.rebuiltPayloads) || rebuild.rebuiltPayloads.length !== 5 ||
    new Set(rebuild.rebuiltPayloads.map((p: {name: string}) => p.name)).size !== 5 ||
    !Array.isArray(rebuild.inspections) || rebuild.inspections.length !== 2) throw new Error("DERIVED_REBUILD_BINDING_INVALID");
  for (const entry of rebuild.rebuiltPayloads) {
    if (!Object.hasOwn(payloads, entry.name)) throw new Error("DERIVED_REBUILD_PAYLOAD_INVALID");
    const uri = `artifacts/rebuild/dashboard/${entry.name}.json`;
    const artifact = artifacts.find(a => a.uri === uri);
    if (!artifact || artifact.sha256 !== entry.sha256 || artifact.bytes !== entry.bytes)
      throw new Error("DERIVED_REBUILD_PAYLOAD_BINDING_INVALID");
    const actual = await read(uri), expected = payloads[entry.name as keyof typeof payloads];
    // Object key order may differ after decoding; values must be identical.
    const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
    if (canonical(actual) !== canonical(expected)) throw new Error("DERIVED_REBUILD_VALUES_MISMATCH");
  }
  const runtimeUri = "artifacts/rebuild/runtime-inventory.json";
  if (artifacts.find(a => a.uri === runtimeUri)?.sha256 !== rebuild.runtimeInventorySha256)
    throw new Error("DERIVED_RUNTIME_NOT_BOUND");
  const runtime = await read(runtimeUri);
  if (runtime.schema !== "hdri-score-runtime@1" || !Array.isArray(runtime.files)) throw new Error("DERIVED_RUNTIME_INVALID");
  for (const file of runtime.files) {
    const retained = artifacts.find(a => a.uri === `artifacts/rebuild/runtime/${file.uri}`);
    if (!retained || retained.sha256 !== file.sha256 || retained.bytes !== file.bytes) throw new Error("DERIVED_RUNTIME_INCOMPLETE");
  }
  const inspected = new Set<string>();
  for (const inspection of rebuild.inspections) {
    const uri = `artifacts/rebuild/${inspection.name}.json`;
    if (inspected.has(uri) || artifacts.find(a => a.uri === uri)?.sha256 !== inspection.sha256)
      throw new Error("DERIVED_ISOLATION_NOT_BOUND");
    inspected.add(uri);
    const records = await read(uri), c = records[0];
    if (records.length !== 1 || !c || c.Image !== runtime.image || c.State.Running || c.State.ExitCode !== 0 ||
      c.HostConfig.NetworkMode !== "none" || c.HostConfig.ReadonlyRootfs !== true ||
      !c.HostConfig.CapDrop?.includes("ALL") || !c.HostConfig.SecurityOpt?.includes("no-new-privileges") ||
      c.Mounts.length !== 3 || !["/capsule", "/runtime", "/work"].every(destination =>
        c.Mounts.some((m: {Destination: string; RW: boolean}) => m.Destination === destination && m.RW === (destination === "/work"))))
      throw new Error("DERIVED_ISOLATION_INVALID");
  }
  for (const report of reports) {
    if (report.reportType === "q2-restore") {
      const uri = "artifacts/qc/release/q2-restore.json";
      if (source.artifacts.find(a => a.uri === uri)?.sha256 !== artifacts.find(a => a.uri === uri)?.sha256)
        throw new Error("DERIVED_PREDECESSOR_REPORT_NOT_SOURCE_BOUND");
    } else if (report.reportType === "privacy-disclosure") {
      if (report.publicManifestSha256 !== candidate.publicManifestSha256 || report.effectiveK !== publicManifest.kAnonymityMin)
        throw new Error("DERIVED_PRIVACY_BINDING_INVALID");
    } else if (report.evidenceSchema !== "hdri-derived-score-check@1" || report.sourceManifestSha256 !== candidate.source.manifestSha256 ||
      report.publicManifestSha256 !== candidate.publicManifestSha256 || report.scoresSha256 !== rebuild.scoresSha256 ||
      report.runtimeInventorySha256 !== rebuild.runtimeInventorySha256) throw new Error("DERIVED_SCIENTIFIC_BINDING_INVALID");
  }
  const sourceReport = reports.find(r => r.reportType === "source-qc")!;
  const reconciliation = reports.find(r => r.reportType === "reconciliation")!;
  if (sourceReport.scoredAssets !== payloads.overview.sampleSize || sourceReport.frameAssets !== sourceReport.stateAssets ||
    reconciliation.scoredAssets !== payloads.overview.sampleSize || reconciliation.unexplainedScoreReferences !== 0)
    throw new Error("DERIVED_SCORE_SET_MISMATCH");
  return { candidate, source, artifacts, reports, rebuild, payloads, status: "evidence-checked-not-admitted" as const };
}
