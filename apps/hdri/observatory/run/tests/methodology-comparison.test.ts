import { afterEach, expect, test } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  compareMethodologySnapshots,
  METHODOLOGY_CONTENT_FIELDS,
} from "../score/methodology-comparison";

const identity = {
  codebookSha256: "a".repeat(64),
  ontologySha256: "b".repeat(64),
  scoringSemanticsSha256: "c".repeat(64),
  signalMapSha256: "d".repeat(64),
  missingnessPolicySha256: "e".repeat(64),
  classificationPolicySha256: "f".repeat(64),
  populationPolicySha256: "1".repeat(64),
  suppressionPolicySha256: "2".repeat(64),
};
test.each(METHODOLOGY_CONTENT_FIELDS)(
  "changing %s cannot be hidden behind matching aggregate hashes",
  (field) => {
    const first = { ...identity, canonicalHash: "3".repeat(64) };
    const result = compareMethodologySnapshots(first, { ...first, [field]: "0".repeat(64) });
    expect(result.scoreComparable).toBe(false);
    expect(result.changedComponents).toEqual([field]);
  },
);
test.each(METHODOLOGY_CONTENT_FIELDS)("absent %s cannot fall back to another digest", (field) => {
  const result = compareMethodologySnapshots(identity, { ...identity, [field]: undefined });
  expect(result.scoreComparable).toBe(false);
  expect(result.violations).toEqual([`current_methodology_invalid_${field}`]);
});
test.each([null, [], {}, { canonicalHash: "a".repeat(64) }, { codebookSha256: "a".repeat(64) }])(
  "partial or malformed methodology cannot grant comparability",
  (input) => {
    const result = compareMethodologySnapshots(input, input);
    expect(result.scoreComparable).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  },
);
test("complete methodology equality does not prove a balanced panel or valid population weights", () => {
  expect(
    compareMethodologySnapshots(identity, { ...identity, codebookVersion: "different-label" }),
  ).toMatchObject({
    scoreComparable: true,
    panelComparable: false,
    postStratComparable: false,
    violations: [],
    hardSuppressions: [
      "panel_comparison_requires_verified_membership_and_attrition",
      "post_stratification_requires_verified_population_and_weights",
    ],
  });
});

const owned: string[] = [];
afterEach(async () => {
  for (const root of owned.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const snapshot = (period: string, capsuleId: string, fields: object = identity) => ({
  schemaVersion: "1",
  reportType: "methodology-snapshot",
  status: "pass",
  violations: [],
  period,
  capsuleId,
  ...fields,
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-methodology-compare-"));
  owned.push(root);
  const previous = path.join(root, "previous.json"),
    current = path.join(root, "current.json");
  await fs.writeFile(previous, JSON.stringify(snapshot("2026-q2", "previous")));
  await fs.writeFile(current, JSON.stringify(snapshot("2026-q3", "current")));
  return { root, previous, current };
}
function command(f: Awaited<ReturnType<typeof fixture>>, output: string, period = "2026-q3") {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      "--conditions=@syrokomskyi/source",
      fileURLToPath(
        new URL("../../tools/scientific-reports/methodology-compare.ts", import.meta.url),
      ),
      "--period",
      period,
      "--capsule-id",
      "current",
      "--evidence-dir",
      path.join(f.root, output),
      "--q2-snapshot",
      f.previous,
      "--q3-snapshot",
      f.current,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.stdout, result.stderr).not.toBe("");
  return { exitCode: result.status, report: JSON.parse(result.stdout) };
}
test("actual command rejects the partial snapshot emitted by the current producer", async () => {
  const f = await fixture();
  const partial = {
    canonicalHash: "a".repeat(64),
    codebookSha256: identity.codebookSha256,
    ontologySha256: identity.ontologySha256,
  };
  await fs.writeFile(f.previous, JSON.stringify(snapshot("2026-q2", "previous", partial)));
  await fs.writeFile(f.current, JSON.stringify(snapshot("2026-q3", "current", partial)));
  expect(command(f, "partial")).toMatchObject({
    exitCode: 1,
    report: {
      status: "fail",
      scoreComparable: false,
      panelComparable: false,
      postStratComparable: false,
      operationallyQualified: false,
    },
  });
});
test("actual command fingerprints consumed bytes, not just reused paths", async () => {
  const f = await fixture();
  const before = command(f, "before");
  expect(before.report).toMatchObject({
    status: "pass",
    scoreComparable: true,
    panelComparable: false,
  });
  await fs.writeFile(
    f.current,
    JSON.stringify(snapshot("2026-q3", "current", { ...identity, ontologySha256: "0".repeat(64) })),
  );
  const after = command(f, "after");
  expect(after.report.scoreComparable).toBe(false);
  expect(after.report.inputFingerprint).not.toBe(before.report.inputFingerprint);
  expect(after.report.changedComponents).toEqual(["ontologySha256"]);
});
test.each([
  { period: "2026-q2" },
  { capsuleId: "another" },
  { status: "fail" },
  { violations: ["bad-source"] },
])("actual command refuses current snapshot scope/status override %j", async (overrides) => {
  const f = await fixture();
  await fs.writeFile(
    f.current,
    JSON.stringify({ ...snapshot("2026-q3", "current"), ...overrides }),
  );
  const result = command(f, "invalid");
  expect(result.exitCode).toBe(1);
  expect(result.report.violations).toContain("current_snapshot_scope_or_status_invalid");
  expect(result.report.scoreComparable).toBe(false);
});
test("year rollover requires the immediately preceding quarter, not the same year", async () => {
  const f = await fixture();
  await fs.writeFile(f.previous, JSON.stringify(snapshot("2026-q4", "previous")));
  await fs.writeFile(f.current, JSON.stringify(snapshot("2027-q1", "current")));
  expect(command(f, "rollover", "2027-q1").exitCode).toBe(0);
  await fs.writeFile(f.previous, JSON.stringify(snapshot("2027-q4", "previous")));
  expect(command(f, "wrong-year", "2027-q1").report.violations).toContain(
    "previous_snapshot_scope_or_status_invalid",
  );
});
test("previous-quarter capsule identity cannot be reused for the current quarter", async () => {
  const f = await fixture();
  await fs.writeFile(f.previous, JSON.stringify(snapshot("2026-q2", "current")));
  expect(command(f, "reused-capsule").report.violations).toContain(
    "previous_snapshot_scope_or_status_invalid",
  );
});
test.each(["not-json", "x".repeat(1024 * 1024 + 1), Buffer.from([0xff])])(
  "malformed or oversized snapshots fail without an affirmative comparison",
  async (bytes) => {
    const f = await fixture();
    await fs.writeFile(f.current, bytes);
    const result = command(f, "bad-bytes");
    expect(result.exitCode).toBe(1);
    expect(result.report.scoreComparable).toBe(false);
    expect(result.report.violations).toContain("current_snapshot_unreadable");
  },
);
