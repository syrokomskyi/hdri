/*
<MODULE_CONTRACT>
<purpose>Freezes methodology snapshot: codebook, ontology, and policy versions with a canonical hash.</purpose>
<non-goals><item>Does not modify methodology files — reads and hashes only.</item></non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing methodology-snapshot module contract for Compass-aware maintenance.</item>
  <item>RFC-0107: include content hashes (codebookSha256, ontologySha256) in snapshot output for content-based methodology identity.</item>
  <item>Q2-Q3 comparability: emit all 8 METHODOLOGY_CONTENT_FIELDS digests. File-backed artifacts
  hash raw source bytes; signal map + scoring semantics use canonical semantic digests
  (methodology-digests.ts) so identical behavior hashes identically across refactors.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { scoringSemanticsDigest, sha256hex, signalMapDigest } from "./methodology-digests";
import { arg, computeInputFingerprint, fileExists, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const codebookPath = arg("--codebook");
const ontologyPath = arg("--ontology");
const missingnessPolicyPath = arg("--missingness-policy");
const classificationPolicyPath = arg("--classification-policy");
const populationPolicyPath = arg("--population-policy");
const suppressionPolicyPath = arg("--suppression-policy");
// Optional provenance marker — e.g. "reconstructed-from-preserved-evidence" for a
// snapshot rebuilt from recovered Q2 content rather than produced at seal time.
const provenance = arg("--provenance");

const violations: string[] = [];
const warnings: string[] = [];

/** Reads + hashes a required file-backed component; records a violation when absent. */
const componentDigest = async (
  filePath: string | undefined,
  label: string,
): Promise<string | undefined> => {
  if (!filePath) {
    violations.push(`${label}_missing`);
    return undefined;
  }
  if (!(await fileExists(path.resolve(filePath)))) {
    violations.push(`${label}_not_found`);
    return undefined;
  }
  return sha256hex(await fs.readFile(path.resolve(filePath)));
};

let codebookVersion: string | undefined;
let ontologyVersion: string | undefined;

// File-backed declarative artifacts → raw source bytes.
const codebookSha256 = await componentDigest(codebookPath, "codebook");
const ontologySha256 = await componentDigest(ontologyPath, "ontology");
const missingnessPolicySha256 = await componentDigest(missingnessPolicyPath, "missingness_policy");
const classificationPolicySha256 = await componentDigest(
  classificationPolicyPath,
  "classification_policy",
);
const populationPolicySha256 = await componentDigest(populationPolicyPath, "population_policy");
const suppressionPolicySha256 = await componentDigest(suppressionPolicyPath, "suppression_policy");

// Code components → canonical semantic digests from the live packages.
let scoringSemanticsSha256: string | undefined;
let signalMapSha256: string | undefined;
if (codebookSha256) {
  const codebook = await fs.readFile(path.resolve(codebookPath!), "utf8");
  codebookVersion = codebook.match(/version:\s*["']?([^"'\n#]+)/)?.[1]?.trim();
  if (!codebookVersion) warnings.push("codebook_version_not_found");
  scoringSemanticsSha256 = scoringSemanticsDigest(codebook);
  signalMapSha256 = signalMapDigest();
}
if (ontologySha256) {
  const ontology = await fs.readFile(path.resolve(ontologyPath!), "utf8");
  ontologyVersion = ontology.match(/version:\s*["']?([^"'\n#]+)/)?.[1]?.trim();
  if (!ontologyVersion) warnings.push("ontology_version_not_found");
}

await writeReport(
  "methodology-snapshot",
  "methodology-snapshot.json",
  evidenceDir,
  period,
  capsuleId,
  computeInputFingerprint(
    period,
    capsuleId,
    codebookPath ?? "",
    ontologyPath ?? "",
    missingnessPolicyPath ?? "",
    classificationPolicyPath ?? "",
    populationPolicyPath ?? "",
    suppressionPolicyPath ?? "",
  ),
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  [],
  {
    codebookVersion,
    ontologyVersion,
    provenance,
    codebookSha256,
    ontologySha256,
    scoringSemanticsSha256,
    signalMapSha256,
    missingnessPolicySha256,
    classificationPolicySha256,
    populationPolicySha256,
    suppressionPolicySha256,
  },
);
