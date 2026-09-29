import { describe, expect, it } from "vitest";
import {
  SCIENTIFIC_REPORTS,
  checkComplementarySuppression,
  type ProductDisclosureEntry,
} from "../release/release-contract";

describe("AC-1: registry emits independently specified per-product verdict vector", () => {
  it("every registry entry has producer, inputSchema, validator, and affectedProducts", () => {
    for (const [filename, entry] of Object.entries(SCIENTIFIC_REPORTS)) {
      expect(entry.producer, `${filename} must have producer`).toBeDefined();
      expect(entry.inputSchema, `${filename} must have inputSchema`).toBeDefined();
      expect(entry.validator, `${filename} must have validator`).toBeDefined();
      expect(entry.affectedProducts, `${filename} must have affectedProducts`).toBeDefined();
      expect(entry.affectedProducts.length).toBeGreaterThan(0);
    }
  });

  it("each product is covered by at least one report", () => {
    const allProducts = new Set<string>();
    for (const entry of Object.values(SCIENTIFIC_REPORTS)) {
      for (const product of entry.affectedProducts) {
        allProducts.add(product);
      }
    }
    expect(allProducts.size).toBeGreaterThanOrEqual(4);
    expect(allProducts).toContain("cross-section");
    expect(allProducts).toContain("panel");
    expect(allProducts).toContain("availability");
    expect(allProducts).toContain("post-stratified");
  });

  it("privacy-disclosure covers all data products", () => {
    const privacyEntry = SCIENTIFIC_REPORTS["privacy-disclosure.json"];
    expect(privacyEntry).toBeDefined();
    expect(privacyEntry.affectedProducts).toContain("cross-section");
    expect(privacyEntry.affectedProducts).toContain("panel");
    expect(privacyEntry.affectedProducts).toContain("availability");
    expect(privacyEntry.affectedProducts).toContain("post-stratified");
  });

  it("reconciliation covers all data products", () => {
    const reconEntry = SCIENTIFIC_REPORTS["reconciliation.json"];
    expect(reconEntry).toBeDefined();
    expect(reconEntry.affectedProducts).toContain("cross-section");
    expect(reconEntry.affectedProducts).toContain("panel");
    expect(reconEntry.affectedProducts).toContain("availability");
    expect(reconEntry.affectedProducts).toContain("post-stratified");
  });
});

describe("AC-2: count consistency does not claim cross-quarter disclosure review", () => {
  it("passes when formats agree on n", () => {
    const current: ProductDisclosureEntry[] = [
      { product: "cross-section", format: "csv", contentSha256: "a", n: 100 },
      { product: "cross-section", format: "json", contentSha256: "b", n: 100 },
    ];
    const result = checkComplementarySuppression(current, 5);
    expect(result.status).toBe("pass");
    expect(result.violations).toHaveLength(0);
  });

  it("fails when cross-format n mismatch detected", () => {
    const current: ProductDisclosureEntry[] = [
      { product: "cross-section", format: "csv", contentSha256: "a", n: 100 },
      { product: "cross-section", format: "json", contentSha256: "b", n: 90 },
    ];
    const result = checkComplementarySuppression(current, 5);
    expect(result.status).toBe("fail");
    expect(result.crossFormatMismatches).toHaveLength(1);
    expect(result.violations).toContain("complementary_suppression_cross_format:cross-section");
  });

  it("allows an expanded quarterly snapshot without claiming cross-quarter privacy", () => {
    const current: ProductDisclosureEntry[] = [
      { product: "cross-section", format: "csv", contentSha256: "a", n: 120 },
    ];
    const result = checkComplementarySuppression(current, 5);
    expect(result.status).toBe("pass");
    expect(result.crossQuarterAssessment).toBe("not-assessed");
    expect(result.violations).toEqual([]);
  });

  it("fails when n below k threshold", () => {
    const current: ProductDisclosureEntry[] = [
      { product: "cross-section", format: "csv", contentSha256: "a", n: 3 },
    ];
    const result = checkComplementarySuppression(current, 5);
    expect(result.status).toBe("fail");
    expect(result.violations).toContain("below_k_threshold:cross-section:csv:n=3");
  });

  it("does not require a previous snapshot for current count consistency", () => {
    const current: ProductDisclosureEntry[] = [
      { product: "cross-section", format: "csv", contentSha256: "a", n: 100 },
      { product: "cross-section", format: "json", contentSha256: "b", n: 100 },
    ];
    const result = checkComplementarySuppression(current, 5);
    expect(result.status).toBe("pass");
  });
});
