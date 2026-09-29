/*
<MODULE_CONTRACT>
<purpose>Prepare an independent derived-score release candidate bound to an immutable signed measurement capsule.</purpose>
<non-goals><item>Does not amend the source capsule, inherit its publication permission, sign a release or publish dashboard files.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Source identity and derived release identity are distinct; product scope belongs to the derived release, not to the historical source publication.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>Unified HDRI: separate the Q3 score release from the sealed availability publication without relaxing capsule profiles.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { validateCapsule, verifyQuarterCapsuleSignature, type QuarterCapsule, type CapsuleArtifact, type CapsuleSignature } from "@syrokomskyi/factory-core";
import { decodeDashboardCrossSection } from "../../tools/dashboard-cross-section";
import { verifyPublicationClosure } from "./publication-closure";
import { requiredRetainedScientificReports } from "./release-contract";
import { PUBLICATION_SCOPE_URI } from "./publication-scope";
import { CLASSIFICATION_DECISION_URI } from "./classification-release-decision";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function readBounded(file: string, max = 8 * 1024 * 1024) {
  const handle = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > max) throw new Error("DERIVED_RELEASE_INPUT_INVALID");
    return await handle.readFile();
  } finally { await handle.close(); }
}

export type ReleaseArtifactScope = Pick<QuarterCapsule, "period" | "capsuleId" | "artifacts">;
export type DerivedScoreCandidate = {
  schema: "hdri-derived-score-candidate@1";
  state: "candidate";
  releaseId: string;
  period: string;
  source: { capsuleId: string; manifestSha256: string; signatureSha256: string };
  requestedProducts: readonly ["cross-section"];
  artifacts: CapsuleArtifact[];
  publicManifestSha256: string;
  requiredScientificReports: string[];
  remainingRequirements: readonly ["scientific-evidence", "independent-reconstruction", "operational-admission", "local-r2-custody", "release-signature"];
};

/** Copies only derived product/control bytes into a fresh private generation. */
export async function prepareDerivedScoreRelease(input: {
  sourceCapsuleDir: string;
  sourceManifestSha256: string;
  verificationKey: Parameters<typeof verifyQuarterCapsuleSignature>[2];
  productDir: string;
  publicationScopePath: string;
  classificationDecisionPath?: string;
  outputParent: string;
}): Promise<{ directory: string; candidate: DerivedScoreCandidate }> {
  if (!/^[a-f0-9]{64}$/.test(input.sourceManifestSha256)) throw new Error("DERIVED_SOURCE_PIN_INVALID");
  const sourceBytes = await readBounded(path.join(input.sourceCapsuleDir, "capsule-manifest.json"));
  const signatureBytes = await readBounded(path.join(input.sourceCapsuleDir, "capsule-signature.json"), 65536);
  const source = JSON.parse(sourceBytes.toString()) as QuarterCapsule;
  const signature = JSON.parse(signatureBytes.toString()) as CapsuleSignature;
  if (hash(sourceBytes) !== input.sourceManifestSha256 || source.state !== "sealed" ||
    !verifyQuarterCapsuleSignature(source, signature, input.verificationKey))
    throw new Error("DERIVED_SOURCE_SIGNATURE_OR_PIN_INVALID");
  validateCapsule(source);
  const files = new Map<string, { stage: CapsuleArtifact["stage"]; bytes: Buffer }>();
  const retain = async (uri: string, stage: CapsuleArtifact["stage"], file: string) => {
    files.set(uri, { stage, bytes: await readBounded(file) });
  };
  await retain(PUBLICATION_SCOPE_URI, "methodology", input.publicationScopePath);
  if (input.classificationDecisionPath)
    await retain(CLASSIFICATION_DECISION_URI, "methodology", input.classificationDecisionPath);
  for (const name of ["public-manifest.json", "cross-section.json", "cross-section.csv"])
    await retain(`artifacts/publication/${name}`, "publication", path.join(input.productDir, name));
  const manifestBytes = files.get("artifacts/publication/public-manifest.json")!.bytes;
  const manifest = JSON.parse(manifestBytes.toString());
  if (manifest.period !== source.period || manifest.capsuleId !== source.capsuleId ||
    !Array.isArray(manifest.products) || manifest.products.length !== 2 ||
    manifest.products.some((entry: { product: string; schemaId: string }) =>
      entry.product !== "cross-section" || entry.schemaId !== "hdri-dashboard-cross-section@1"))
    throw new Error("DERIVED_PRODUCT_SCOPE_MISMATCH");
  decodeDashboardCrossSection(files.get("artifacts/publication/cross-section.json")!.bytes.toString(), manifest.kAnonymityMin);
  const columns = ["section", "id", "label", "bundesland", "gewerk", "n", "mean", "p10", "p25", "p50", "p75", "p90", "min", "max", "stdDev", "weight", "share"];
  const rows: Record<string, string | number>[] = JSON.parse(files.get("artifacts/publication/cross-section.json")!.bytes.toString());
  const csv: string[][] = parse(files.get("artifacts/publication/cross-section.csv")!.bytes, { bom: false });
  const expected = [columns, ...rows.map(row => columns.map(column => row[column] === undefined ? "" : String(row[column])))];
  if (JSON.stringify(csv) !== JSON.stringify(expected)) throw new Error("DERIVED_CROSS_FORMAT_MISMATCH");
  const artifacts: CapsuleArtifact[] = [...files].map(([uri, file]) => ({ uri, stage: file.stage, sha256: hash(file.bytes), bytes: file.bytes.length }));
  // Scope is explicitly the new derivation's inventory, never a relabelled source capsule.
  const scope: ReleaseArtifactScope = { period: source.period, capsuleId: source.capsuleId, artifacts };
  const parent = await fs.realpath(input.outputParent);
  const sourceRoot = await fs.realpath(input.sourceCapsuleDir);
  if (parent === sourceRoot || parent.startsWith(sourceRoot + path.sep)) throw new Error("DERIVED_OUTPUT_INSIDE_SOURCE");
  const directory = await fs.mkdtemp(path.join(parent, "derived-score-"));
  await fs.chmod(directory, 0o700);
  for (const [uri, file] of files) {
    const destination = path.join(directory, uri);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.writeFile(destination, file.bytes, { flag: "wx", mode: 0o600 });
  }
  const closure = await verifyPublicationClosure(directory, scope, path.join(directory, "artifacts/publication/public-manifest.json"));
  if (closure.requestedProducts.length !== 1 || closure.requestedProducts[0] !== "cross-section")
    throw new Error("DERIVED_SCOPE_NOT_CROSS_SECTION");
  const reports = await requiredRetainedScientificReports(directory, scope, ["cross-section"]);
  const candidate: DerivedScoreCandidate = {
    schema: "hdri-derived-score-candidate@1", state: "candidate", releaseId: randomUUID(), period: source.period,
    source: { capsuleId: source.capsuleId, manifestSha256: hash(sourceBytes), signatureSha256: hash(signatureBytes) },
    requestedProducts: ["cross-section"], artifacts, publicManifestSha256: closure.publicManifestSha256,
    requiredScientificReports: reports.map(([name]) => name),
    remainingRequirements: ["scientific-evidence", "independent-reconstruction", "operational-admission", "local-r2-custody", "release-signature"],
  };
  // Retain exact source control bytes as provenance, outside the new product inventory.
  await fs.writeFile(path.join(directory, "source-capsule-manifest.json"), sourceBytes, { flag: "wx", mode: 0o600 });
  await fs.writeFile(path.join(directory, "source-capsule-signature.json"), signatureBytes, { flag: "wx", mode: 0o600 });
  await fs.writeFile(path.join(directory, "derived-score-candidate.json"), JSON.stringify(candidate, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { directory, candidate };
}
