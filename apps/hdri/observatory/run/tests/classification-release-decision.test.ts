import {afterEach, expect, test} from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import type {QuarterCapsule} from "@syrokomskyi/factory-core";
import {CLASSIFICATION_DECISION_URI} from "../release/classification-release-decision";
import {readScientificReports, requiredRetainedScientificReports, requiredScientificReports} from "../release/release-contract";

const roots: string[] = [];
afterEach(async () => {for (const root of roots.splice(0)) await fs.rm(root, {recursive: true, force: true});});
async function fixture(changes: Record<string, unknown> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-classification-decision-")); roots.push(root);
  const decision = {schema: "hdri-classification-release-decision@1", period: "2026-q3", capsuleId: "fixture",
    product: "cross-section", classificationMode: "existing-automatic-labels", validationSampleRequired: false,
    accuracyClaim: "not-validated", authority: "operator-approved-2026-09-28", ...changes};
  const bytes = JSON.stringify(decision), file = path.join(root, CLASSIFICATION_DECISION_URI);
  await fs.mkdir(path.dirname(file), {recursive: true}); await fs.writeFile(file, bytes);
  const capsule: QuarterCapsule = {period: "2026-q3", capsuleId: "fixture", state: "candidate", instrumentPlan: [],
    artifacts: [{stage: "methodology", uri: CLASSIFICATION_DECISION_URI, bytes: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex")}]};
  return {root, file, capsule};
}
test("Q3 decision removes only classification QC and does not generate an accuracy pass", async () => {
  const {root,capsule} = await fixture();
  expect((await requiredRetainedScientificReports(root,capsule,["cross-section"])).map(([name])=>name)).toEqual([
    "q2-restore.json", "source-qc.json", "privacy-disclosure.json", "methodology-snapshot.json", "reconciliation.json",
  ]);
  expect(requiredScientificReports(["cross-section"]).some(([name])=>name==="classification-qc.json")).toBe(true);
});
test("an unretained file cannot waive the classification requirement", async () => {
  const {root,capsule} = await fixture();
  expect(await requiredRetainedScientificReports(root,{...capsule,artifacts: []},["cross-section"])).toHaveLength(6);
});
test.each([{period: "2026-q4"}, {capsuleId: "other"}, {accuracyClaim: "validated"}, {validationSampleRequired: true},
  {authority: "unapproved"}, {product: "post-stratified"}, {extra: "not allowed"}])("rejects incompatible retained decision: %j", async change => {
  const {root,capsule} = await fixture(change);
  await expect(requiredRetainedScientificReports(root,capsule,["cross-section"])).rejects.toThrow("SCOPE_INVALID");
});
test("Q4, panel and weighted releases cannot reuse the exception", async () => {
  const {root,capsule} = await fixture();
  await expect(requiredRetainedScientificReports(root,{...capsule,period: "2026-q4"},["cross-section"])).rejects.toThrow("SCOPE_INVALID");
  await expect(requiredRetainedScientificReports(root,capsule,["cross-section","panel"])).rejects.toThrow("SCOPE_INVALID");
  await expect(requiredRetainedScientificReports(root,capsule,["post-stratified"])).rejects.toThrow("SCOPE_INVALID");
});
test("edited, missing and duplicate retained decision artifacts fail closed", async () => {
  const {root,file,capsule} = await fixture();
  await expect(requiredRetainedScientificReports(root,{...capsule,artifacts: [...capsule.artifacts,...capsule.artifacts]},["cross-section"])).rejects.toThrow("ARTIFACT_INVALID");
  await fs.writeFile(file,(await fs.readFile(file,"utf8")).replace("fixture","fixturx"));
  await expect(requiredRetainedScientificReports(root,capsule,["cross-section"])).rejects.toThrow("DIGEST_MISMATCH");
  await fs.unlink(file);
  await expect(requiredRetainedScientificReports(root,capsule,["cross-section"])).rejects.toThrow();
});
test("the real report reader still rejects missing privacy evidence and never returns a classification pass", async () => {
  const {root,capsule} = await fixture();
  for (const [filename,entry] of await requiredRetainedScientificReports(root,capsule,["cross-section"])) {
    await fs.writeFile(path.join(root,filename),JSON.stringify({schemaVersion: "1", reportType: entry.reportType,
      period: capsule.period, capsuleId: capsule.capsuleId, inputFingerprint: "a".repeat(64),
      status: "pass", violations: [], warnings: [], hardSuppressions: [], checkedAt: "2026-09-28T00:00:00Z"}));
  }
  const reports = await readScientificReports(root,capsule,["cross-section"],root);
  expect(reports).toHaveLength(5);
  expect(reports.some(r=>r.reportType==="classification-qc")).toBe(false);
  await expect(readScientificReports(root,capsule,["cross-section"])).rejects.toThrow();
  await fs.unlink(path.join(root,"privacy-disclosure.json"));
  await expect(readScientificReports(root,capsule,["cross-section"],root)).rejects.toThrow();
});
