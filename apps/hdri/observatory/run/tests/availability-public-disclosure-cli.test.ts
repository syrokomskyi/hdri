import { afterEach, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { serializeAvailabilityPreview } from "../release/availability-preview";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const cli = path.resolve("tools/scientific-reports/privacy-review.ts");
const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-public-disclosure-")); roots.push(root);
  const policy = "default_k: 12\nhard_floor: 5\nhigh_risk_release: false\n";
  const product = serializeAvailabilityPreview({ schema: "hdri-availability-candidate@1", status: "candidate-not-approved",
    period: "2026-q3", denominator: "sealed-liveness-targets", outcomePolicy: "availability-outcome-v1", effectiveK: 12,
    n: 100, counts: { reachable: 40, unavailable: 30, blocked: 15, indeterminate: 15 }, reachableShareOfTargets: 0.4 }, 12);
  const manifest = { schema: "hdri-public-manifest@1", policyDigest: hash(policy), kAnonymityMin: 12,
    products: (["json", "csv"] as const).map(format => ({ schema: "hdri-public-product@1", product: "availability",
      schemaId: String(product.schemaId), format, contentSha256: hash(product[format]), bytes: Buffer.byteLength(product[format]),
      policySha256: hash(policy), sourceAggregateSha256: "a".repeat(64) })) };
  await fs.writeFile(path.join(root, "policy.yaml"), policy);
  await fs.writeFile(path.join(root, "availability.json"), product.json);
  await fs.writeFile(path.join(root, "availability.csv"), product.csv);
  const run = async () => {
    await fs.writeFile(path.join(root, "public-manifest.json"), JSON.stringify(manifest));
    return JSON.parse(execFileSync(process.execPath, [tsx, "-C", "@syrokomskyi/source", cli,
      "--period", "2026-q3", "--capsule-id", "fixture", "--evidence-dir", path.join(root, "report"),
      "--public-manifest", path.join(root, "public-manifest.json"), "--policy", path.join(root, "policy.yaml")],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  };
  return { root, product, manifest, run };
}
test("scientific disclosure CLI inspects both v2 formats and every outcome without granting historical disclosure clearance", async () => {
  const fixtureData = await fixture();
  const report = await fixtureData.run();
  expect(report.status).toBe("pass");
  expect(report.filesChecked).toBe(2);
  expect(report.cellsChecked).toBe(5);
  expect(report.warnings).toContain("single_product_only_prior_releases_and_auxiliary_information_not_reviewed");
});
test.each(["hash", "size", "policy", "missing-format", "mixed-product", "csv-substitution", "small-cell", "schema-downgrade"])(
  "scientific disclosure CLI rejects %s", async change => {
    const data = await fixture();
    if (change === "hash") data.manifest.products[0]!.contentSha256 = "b".repeat(64);
    if (change === "size") data.manifest.products[0]!.bytes++;
    if (change === "policy") data.manifest.policyDigest = "b".repeat(64);
    if (change === "missing-format") data.manifest.products.pop();
    if (change === "mixed-product") data.manifest.products[0]!.product = "cross-section";
    if (change === "schema-downgrade") for (const entry of data.manifest.products) entry.schemaId = "hdri-public-availability@1";
    if (change === "csv-substitution") await fs.writeFile(path.join(data.root, "availability.csv"), data.product.csv.replace(",40,30,", ",30,40,"));
    if (change === "small-cell") {
      const json = JSON.parse(data.product.json);
      json.rows[0].blocked = 1;
      json.rows[0].indeterminate = 29;
      await fs.writeFile(path.join(data.root, "availability.json"), JSON.stringify(json, null, 2) + "\n");
    }
    const report = await data.run();
    expect(report.status).toBe("fail");
    expect(report.violations.length).toBeGreaterThan(0);
  },
);
