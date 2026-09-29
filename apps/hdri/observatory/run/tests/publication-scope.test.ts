import { afterEach, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { SCIENTIFIC_PRODUCTS, readScientificReports, requiredScientificReports } from "../release/release-contract";
import { PUBLICATION_SCOPE_URI, readRetainedPublicationScope } from "../release/publication-scope";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const scope = { schema: "hdri-publication-intent@1", period: "2026-q3", capsuleId: "fixture",
  requestedProducts: ["availability"], excludedProducts: ["cross-section", "panel", "post-stratified"],
  claims: ["Observed targets only."], nonClaims: ["No population inference."], authority: "Test operator",
  releaseAuthority: "none; all applicable scientific, privacy and custody gates remain required" };
async function fixture(changes: Record<string, unknown> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-scope-")); roots.push(root);
  const bytes = JSON.stringify({ ...scope, ...changes });
  const file = path.join(root, PUBLICATION_SCOPE_URI);
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes);
  const capsule: QuarterCapsule = { capsuleId: "fixture", period: "2026-q3", state: "candidate", instrumentPlan: [],
    artifacts: [{ stage: "methodology", uri: PUBLICATION_SCOPE_URI, bytes: Buffer.byteLength(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex") }] };
  return { root, file, capsule };
}
test("availability scope retains restoration, source, privacy, methodology and reconciliation requirements", () => {
  expect(requiredScientificReports(["availability"]).map(([name]) => name)).toEqual([
    "q2-restore.json", "source-qc.json", "availability.json", "privacy-disclosure.json", "methodology-snapshot.json", "reconciliation.json",
  ]);
  expect(requiredScientificReports()).toHaveLength(8);
});
test("absent retained scope defaults to all products even if a mutable scope file exists", async () => {
  const { root, capsule } = await fixture();
  expect(await readRetainedPublicationScope(root, { ...capsule, artifacts: [] })).toEqual(SCIENTIFIC_PRODUCTS);
});
test("valid byte-bound scope selects availability only", async () => {
  const { root, capsule } = await fixture();
  expect(await readRetainedPublicationScope(root, capsule)).toEqual(["availability"]);
});
test.each([{ period: "2026-q2" }, { capsuleId: "other" }, { requestedProducts: [] },
  { requestedProducts: ["availability", "availability"] }, { excludedProducts: [] },
  { requestedProducts: ["unknown"] }, { releaseAuthority: "approved" }, { extra: true }])(
  "malformed retained scope fails instead of reducing gates: %j", async changes => {
    const { root, capsule } = await fixture(changes);
    await expect(readRetainedPublicationScope(root, capsule)).rejects.toThrow();
  },
);
test("modified scope bytes fail before selecting reports", async () => {
  const { root, file, capsule } = await fixture();
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("2026-q3", "2026-q4"));
  await expect(readRetainedPublicationScope(root, capsule)).rejects.toThrow("DIGEST_MISMATCH");
});
test("actual report reader requires every applicable report but no classification fixture", async () => {
  const { root, capsule } = await fixture();
  const products = await readRetainedPublicationScope(root, capsule);
  for (const [filename, entry] of requiredScientificReports(products)) await fs.writeFile(path.join(root, filename), JSON.stringify({
    schemaVersion: "1", reportType: entry.reportType, period: capsule.period, capsuleId: capsule.capsuleId,
    inputFingerprint: "a".repeat(64), status: "pass", violations: [], warnings: [], hardSuppressions: [],
    checkedAt: "2026-09-27T00:00:00.000Z",
  }));
  expect(await readScientificReports(root, capsule, products)).toHaveLength(6);
  await expect(readScientificReports(root, capsule)).rejects.toThrow();
  await fs.unlink(path.join(root, "source-qc.json"));
  await expect(readScientificReports(root, capsule, products)).rejects.toThrow();
});

test.each(["source-qc.json", "methodology-snapshot.json"])("availability-only %s cannot satisfy another product's gate", async scopedFilename => {
  const { root, capsule } = await fixture();
  for (const [filename, entry] of requiredScientificReports()) await fs.writeFile(path.join(root, filename), JSON.stringify({
    schemaVersion: "1", reportType: entry.reportType, period: capsule.period, capsuleId: capsule.capsuleId,
    inputFingerprint: "b".repeat(64), status: "pass", violations: [], warnings: [], hardSuppressions: [],
    checkedAt: "2026-09-27T00:00:00.000Z", ...(filename === scopedFilename ? { applicability: ["availability"] } : {}),
  }));
  expect(await readScientificReports(root, capsule, ["availability"])).toHaveLength(6);
  await expect(readScientificReports(root, capsule, ["cross-section"])).rejects.toThrow("does not cover requested products");
});

test("availability release rejects substituted, missing or duplicate retained scientific reports", async () => {
  const { root, capsule: base } = await fixture();
  const capsule = { ...base, releaseProfile: "availability-only@1" as const, artifacts: [...base.artifacts] };
  for (const [filename, entry] of requiredScientificReports(["availability"])) {
    const bytes = JSON.stringify({ schemaVersion: "1", reportType: entry.reportType,
      period: capsule.period, capsuleId: capsule.capsuleId, inputFingerprint: "a".repeat(64),
      status: "pass", violations: [], warnings: [], hardSuppressions: [], checkedAt: "2026-09-27T00:00:00.000Z" });
    await fs.writeFile(path.join(root, filename), bytes);
    capsule.artifacts.push({ stage: "methodology", uri: `artifacts/qc/release/${filename}`,
      bytes: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  expect(await readScientificReports(root, capsule, ["availability"])).toHaveLength(6);
  const retained = capsule.artifacts.pop()!;
  await expect(readScientificReports(root, capsule, ["availability"])).rejects.toThrow("not capsule-bound");
  capsule.artifacts.push(retained, retained);
  await expect(readScientificReports(root, capsule, ["availability"])).rejects.toThrow("not capsule-bound");
  capsule.artifacts.pop();
  const file = path.join(root, "reconciliation.json");
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("a".repeat(64), "b".repeat(64)));
  await expect(readScientificReports(root, capsule, ["availability"])).rejects.toThrow("not capsule-bound");
});
