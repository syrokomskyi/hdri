/*
<MODULE_CONTRACT>
<purpose>Read the capsule-bound Q3 classification release decision without claiming measured classification accuracy.</purpose>
<non-goals><item>Does not grant publication admission or relax privacy, scoring, custody or other scientific requirements.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Implement the operator-approved Q3 cross-section exception for a missing classification validation sample.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {parse} from "yaml";
import type {QuarterCapsule} from "@syrokomskyi/factory-core";
import type {ScientificProduct} from "./release-contract";

export const CLASSIFICATION_DECISION_URI = "artifacts/methodology/classification-release-decision.yaml";

export async function hasRetainedClassificationDecision(
  root: string, capsule: Pick<QuarterCapsule, "period" | "capsuleId" | "artifacts">, products: readonly ScientificProduct[],
): Promise<boolean> {
  const entries = capsule.artifacts.filter(a => a.uri === CLASSIFICATION_DECISION_URI);
  if (!entries.length) return false;
  const artifact = entries[0]!;
  if (entries.length !== 1 || artifact.stage !== "methodology" || artifact.bytes > 65536 || artifact.bytes < 1)
    throw new Error("CLASSIFICATION_DECISION_ARTIFACT_INVALID");
  const handle = await fs.open(path.join(root, CLASSIFICATION_DECISION_URI), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== artifact.bytes) throw new Error("CLASSIFICATION_DECISION_ARTIFACT_INVALID");
    bytes = await handle.readFile();
  } finally {await handle.close();}
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
    throw new Error("CLASSIFICATION_DECISION_DIGEST_MISMATCH");
  const decision = parse(bytes.toString("utf8"));
  const expected = {
    schema: "hdri-classification-release-decision@1", period: "2026-q3", capsuleId: capsule.capsuleId,
    product: "cross-section", classificationMode: "existing-automatic-labels",
    validationSampleRequired: false, accuracyClaim: "not-validated",
    authority: "operator-approved-2026-09-28",
  };
  if (capsule.period !== "2026-q3" || products.length !== 1 || products[0] !== "cross-section" ||
    !decision || typeof decision !== "object" || Object.keys(decision).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key,value]) => decision[key] !== value))
    throw new Error("CLASSIFICATION_DECISION_SCOPE_INVALID");
  return true;
}
