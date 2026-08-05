/**
 * Smoke test: verifies the pipeline definition loads correctly,
 * all 4 phases resolve, and gogol ordering matches expectations.
 */

import { describe, it, expect } from "vitest";
import { createPipeline } from "../pipeline";
import { parseBriefMarkdown } from "../brief";

describe("Pipeline assembly", () => {
  it("creates a pipeline with all phases and gogols", () => {
    const pipeline = createPipeline();

    expect(pipeline.title).toBeTruthy();
    expect(pipeline.steps.length).toBeGreaterThan(0);
  });

  it("has correct gogol order across phases", () => {
    const pipeline = createPipeline();
    const ids = pipeline.steps.map((s) => s.id);

    // harvest phase
    expect(ids).toContain("setup-observatory-run");

    // observe phase
    expect(ids).toContain("sync-from-factory");
    expect(ids).toContain("sign-observations");
    expect(ids).toContain("mint-asset-ids");

    // interpret phase
    expect(ids).toContain("score-hdri");
    expect(ids).toContain("build-cohorts");

    // publish phase
    expect(ids).toContain("write-vault");
    expect(ids).toContain("export-mart");
    expect(ids).toContain("prepare-quarter-release");
    expect(ids).toContain("seal-capsule");
    expect(ids).toContain("validate-quarter");
    expect(ids).toContain("release-quarter");

    // Order: harvest → observe → interpret → publish
    expect(ids.indexOf("setup-observatory-run")).toBeLessThan(ids.indexOf("sync-from-factory"));
    expect(ids.indexOf("sync-from-factory")).toBeLessThan(ids.indexOf("sign-observations"));
    expect(ids.indexOf("sign-observations")).toBeLessThan(ids.indexOf("score-hdri"));
    expect(ids.indexOf("score-hdri")).toBeLessThan(ids.indexOf("build-cohorts"));
    expect(ids.indexOf("build-cohorts")).toBeLessThan(ids.indexOf("write-vault"));
    expect(ids.indexOf("write-vault")).toBeLessThan(ids.indexOf("export-mart"));
    expect(ids.indexOf("export-mart")).toBeLessThan(ids.indexOf("prepare-quarter-release"));
    expect(ids.indexOf("prepare-quarter-release")).toBeLessThan(ids.indexOf("seal-capsule"));
    expect(ids.indexOf("seal-capsule")).toBeLessThan(ids.indexOf("validate-quarter"));
    expect(ids.indexOf("validate-quarter")).toBeLessThan(ids.indexOf("release-quarter"));
  });

  it("has exactly 12 gogols", () => {
    const pipeline = createPipeline();
    expect(pipeline.steps.length).toBe(12);
  });
});

describe("Brief parsing", () => {
  it("parses a valid brief", () => {
    const brief = parseBriefMarkdown(`---
outputLanguage: de
period: "2025-Q2"
capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc"
ontologyVersion: "1.0.0"
codebookId: "observatory-v1"
factoryContractRootDir: "../factory/a-contract-ontology"
publicMode: false
skipGogols: []
---

Digital Observatory run brief.
`);

    expect(brief.outputLanguage).toBe("de");
    expect(brief.period).toBe("2025-q2");
    expect(brief.ontologyVersion).toBe("1.0.0");
    expect(brief.codebookId).toBe("observatory-v1");
    expect(brief.publicMode).toBe(false);
    expect(brief.skipGogols).toEqual([]);
  });

  it("throws on missing outputLanguage", () => {
    expect(() =>
      parseBriefMarkdown(`---
period: "2025-Q2"
capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc"
factoryContractRootDir: "../factory/a-contract-ontology"
---
`),
    ).toThrow("outputLanguage");
  });

  it("throws on missing period", () => {
    expect(() =>
      parseBriefMarkdown(`---
outputLanguage: de
capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc"
factoryContractRootDir: "../factory/a-contract-ontology"
---
`),
    ).toThrow("period");
  });

  it("throws on missing codebookId", () => {
    expect(() =>
      parseBriefMarkdown(`---
outputLanguage: de
period: "2025-Q2"
capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc"
factoryContractRootDir: "../factory/a-contract-ontology"
---
`),
    ).toThrow("codebookId");
  });

  it("throws on deprecated codebookVersion field", () => {
    expect(() =>
      parseBriefMarkdown(`---
outputLanguage: de
period: "2025-Q2"
capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc"
codebookVersion: "observatory-v1"
factoryContractRootDir: "../factory/a-contract-ontology"
---
`),
    ).toThrow("deprecated");
  });

  it("uses defaults for optional fields", () => {
    const brief = parseBriefMarkdown(`---
outputLanguage: de
period: "2025-Q2"
capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc"
codebookId: "observatory-v1"
factoryContractRootDir: "../factory/a-contract-ontology"
---
`);
    expect(brief.ontologyVersion).toBe("1.0.0");
    expect(brief.codebookId).toBe("observatory-v1");
    expect(brief.capsuleId).toMatch(/-7/);
    expect(brief.publicMode).toBe(false);
  });
});
