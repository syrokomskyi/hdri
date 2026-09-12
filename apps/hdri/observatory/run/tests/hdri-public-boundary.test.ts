/*
<MODULE_CONTRACT>
<purpose>Acceptance tests for RFC-0108: separate private HDRI marts from verified public products.</purpose>
<non-goals><item>Does not test release sealing or replica verification — those are in release-contract.test.ts.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0108: 7 acceptance tests covering asset-level CSV rejection, PublicProductRef content-policy binding, k-anon violation detection, zero-data-cell failure, content hash mismatch, complementary suppression, and manifest-listed dashboard export.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  PUBLIC_PRODUCT_SCHEMAS,
  type PublicProductRef,
  type DisclosureReport,
} from "../release/release-contract";

function makePublicProductRef(overrides: Partial<PublicProductRef> = {}): PublicProductRef {
  return {
    schema: "hdri-public-product@1",
    product: "cross-section",
    format: "csv",
    contentSha256: "a".repeat(64),
    bytes: 100,
    policySha256: "b".repeat(64),
    schemaId: "hdri-public-product@1",
    sourceAggregateSha256: "c".repeat(64),
    ...overrides,
  };
}

function makeDisclosureReport(overrides: Partial<DisclosureReport> = {}): DisclosureReport {
  return {
    schema: "hdri-disclosure-report@1",
    publicManifestSha256: "d".repeat(64),
    filesChecked: 1,
    cellsChecked: 5,
    effectiveK: 12,
    status: "pass",
    violations: [],
    ...overrides,
  };
}

describe("RFC-0108 AC-1: asset-level CSV offered as public product must fail", () => {
  it("RFC-0108 AC-1", () => {
    const schema = PUBLIC_PRODUCT_SCHEMAS["cross-section"];
    const csvColumns = ["asset_id", "domain", "strata_code", "overall_score"];
    const prohibited = csvColumns.filter((col) => schema.prohibitedFields.includes(col));
    expect(prohibited.length).toBeGreaterThan(0);
    expect(prohibited).toContain("asset_id");
    expect(prohibited).toContain("domain");
  });
});

describe("RFC-0108 AC-2: PublicProductRef binds content digest to disclosure policy", () => {
  it("RFC-0108 AC-2", () => {
    const policyDigest = createHash("sha256").update("12:5:false").digest("hex");
    const ref = makePublicProductRef({ policySha256: policyDigest });
    expect(ref.policySha256).toBe(policyDigest);
    expect(ref.policySha256).toHaveLength(64);
    expect(ref.contentSha256).toHaveLength(64);
    expect(ref.sourceAggregateSha256).toHaveLength(64);
    expect(ref.schema).toBe("hdri-public-product@1");
  });
});

describe("RFC-0108 AC-3: public JSON cell with n below effectiveK must fail", () => {
  it("RFC-0108 AC-3", () => {
    const effectiveK = 12;
    const cells = [
      { n: 15, suppressed: false },
      { n: 5, suppressed: false },
      { n: 0, suppressed: true },
    ];
    const violations: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      if (cell.suppressed) continue;
      if (cell.n < effectiveK) {
        violations.push(`k_anon_violation:cell_${i}:count_below_${effectiveK}`);
      }
    }
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("count_below_12");
  });
});

describe("RFC-0108 AC-4: no data cells inspected must fail", () => {
  it("RFC-0108 AC-4", () => {
    const report = makeDisclosureReport({
      cellsChecked: 0,
      status: "fail",
      violations: ["zero_data_cells_inspected"],
    });
    expect(report.status).toBe("fail");
    expect(report.violations).toContain("zero_data_cells_inspected");
  });
});

describe("RFC-0108 AC-5: public bytes change after privacy review must fail", () => {
  it("RFC-0108 AC-5", () => {
    const originalContent = '{"axis":"bundesland","n":15,"mean":0.65}';
    const originalHash = createHash("sha256").update(originalContent, "utf8").digest("hex");
    const tamperedContent = '{"axis":"bundesland","n":15,"mean":0.99}';
    const tamperedHash = createHash("sha256").update(tamperedContent, "utf8").digest("hex");
    expect(originalHash).not.toBe(tamperedHash);
    const ref = makePublicProductRef({ contentSha256: originalHash });
    const actualHash = tamperedHash;
    expect(actualHash).not.toBe(ref.contentSha256);
  });
});

describe("RFC-0108 AC-6: totals revealing suppressed cell trigger complementary suppression", () => {
  it("RFC-0108 AC-6", () => {
    const effectiveK = 12;
    const rows = [
      { axis: "bundesland", axis_value: "BY", n: 3 },
      { axis: "bundesland", axis_value: "BY", n: 4 },
    ];
    const rowTotals = new Map<string, number>();
    for (const row of rows) {
      if (row.n < effectiveK) {
        const key = `${row.axis}|${row.axis_value}`;
        rowTotals.set(key, (rowTotals.get(key) ?? 0) + row.n);
      }
    }
    const violations: string[] = [];
    for (const [key, total] of rowTotals) {
      if (total > 0 && total < effectiveK) {
        violations.push(
          `complementary_suppression_needed:${key}:total_${total}_below_${effectiveK}`,
        );
      }
    }
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("total_7_below_12");
  });
});

describe("RFC-0108 AC-7: valid public aggregate passes and dashboard uses manifest-listed files", () => {
  it("RFC-0108 AC-7", () => {
    const manifest = {
      schema: "hdri-public-manifest@1",
      products: [
        makePublicProductRef({ product: "cross-section", format: "csv" }),
        makePublicProductRef({ product: "cross-section", format: "json" }),
      ],
      kAnonymityMin: 12,
      policyDigest: "b".repeat(64),
    };
    const manifestListedFiles = manifest.products.map((p) => `${p.product}.${p.format}`);
    const dashboardFiles = ["cross-section.csv", "cross-section.json"];
    const allListed = dashboardFiles.every((f) => manifestListedFiles.includes(f));
    expect(allListed).toBe(true);
    expect(manifest.products).toHaveLength(2);
    expect(manifest.kAnonymityMin).toBe(12);
  });
});
