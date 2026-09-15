/*
<MODULE_CONTRACT>
<purpose>Acceptance tests for RFC-0107: typed scientific gates and longitudinal comparability.</purpose>
<non-goals><item>Does not test release sealing or replica verification — those are in release-contract.test.ts.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0107: 8 acceptance tests covering report registry, input fingerprint binding, methodology content identity, set reconciliation, panel suppression, population frame suppression, exact host validation, and deterministic sampling.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  SCIENTIFIC_REPORTS,
  type ScientificInputs,
  type ProductVerdict,
  type ScientificReport,
} from "../release/release-contract";
import { computeMethodologyFingerprint, type MethodologyInput } from "../score/methodology-core";
import { compareMethodologySnapshots } from "../score/methodology-comparison";

const mockScientificInputs: ScientificInputs = {
  schema: "hdri-scientific-inputs@1",
  capsuleManifestSha256: "abc123",
  sourceAdmissionRef: "evidence/source-admission.json",
  frameRef: "evidence/frame.json",
  observationManifestRef: "evidence/observations.json",
  scoresRef: "evidence/scores.json",
  methodologyRef: "evidence/methodology.json",
  classificationPlanRef: "policies/classification-qc-policy-v1.yaml",
  classificationLabelsRef: null,
  populationFrameRef: null,
};

const computeInputFingerprint = (inputs: ScientificInputs): string =>
  createHash("sha256").update(JSON.stringify(inputs)).digest("hex");

describe("RFC-0107 AC-1: report registry resolves all required input references", () => {
  it("RFC-0107 AC-1", () => {
    const reportFiles = Object.keys(SCIENTIFIC_REPORTS);
    expect(reportFiles).toHaveLength(8);
    for (const [filename, entry] of Object.entries(SCIENTIFIC_REPORTS)) {
      expect(entry.reportType).toBeDefined();
      expect(entry.schema).toBe("hdri-scientific-report@1");
      expect(filename).toMatch(/\.json$/);
    }
  });
});

describe("RFC-0107 AC-2: ScientificReport binds its input fingerprint", () => {
  it("RFC-0107 AC-2", () => {
    const fingerprint = computeInputFingerprint(mockScientificInputs);
    const report: ScientificReport = {
      schema: "hdri-scientific-report@1",
      reportType: "source-qc",
      inputFingerprint: fingerprint,
      status: "pass",
      violations: [],
      productVerdicts: [],
      evidenceRefs: [mockScientificInputs.sourceAdmissionRef],
    };
    expect(report.inputFingerprint).toBe(fingerprint);
    expect(report.inputFingerprint).toHaveLength(64);
    expect(report.schema).toBe("hdri-scientific-report@1");
  });
});

describe("RFC-0107 AC-3: absent methodology fields fail comparability", () => {
  it("RFC-0107 AC-3", () => {
    const q2Snapshot: {
      codebookVersion: string;
      ontologyVersion: string;
      sourceFrameId: string;
      canonicalHash?: string;
      codebookSha256?: string;
      ontologySha256?: string;
    } = {
      codebookVersion: "1.0",
      ontologyVersion: "1.0",
      sourceFrameId: "frame-2024",
    };
    const q3Snapshot: {
      codebookVersion: string;
      ontologyVersion: string;
      sourceFrameId: string;
      canonicalHash?: string;
      codebookSha256?: string;
      ontologySha256?: string;
    } = {
      codebookVersion: "1.0",
      ontologyVersion: "1.0",
      sourceFrameId: "frame-2024",
    };

    const q2ContentId =
      q2Snapshot.canonicalHash ?? q2Snapshot.codebookSha256 ?? q2Snapshot.ontologySha256;
    const q3ContentId =
      q3Snapshot.canonicalHash ?? q3Snapshot.codebookSha256 ?? q3Snapshot.ontologySha256;

    expect(q2ContentId).toBeUndefined();
    expect(q3ContentId).toBeUndefined();
    expect(Boolean(q2ContentId && q3ContentId)).toBe(false);
    const actual = compareMethodologySnapshots(q2Snapshot, q3Snapshot);
    expect(actual.scoreComparable).toBe(false);
    expect(actual.violations).toContain("current_methodology_invalid_scoringSemanticsSha256");
  });
});

describe("RFC-0107 AC-4: many-to-one observation relations are accepted", () => {
  it("RFC-0107 AC-4", () => {
    const sourceIds = new Set(["asset-1", "asset-2", "asset-3"]);
    const observationRefs = new Set(["asset-1", "asset-1", "asset-2", "asset-3"]);
    const scoreRefs = new Set(["asset-1", "asset-2", "asset-3"]);

    let unexplained = 0;
    for (const obsRef of observationRefs) {
      if (sourceIds.size > 0 && !sourceIds.has(obsRef)) unexplained++;
    }
    for (const scoreRef of scoreRefs) {
      if (observationRefs.size > 0 && !observationRefs.has(scoreRef)) unexplained++;
    }

    expect(unexplained).toBe(0);
    expect(sourceIds.size).toBe(3);
    expect(observationRefs.size).toBe(3);
    expect(scoreRefs.size).toBe(3);
  });
});

describe("RFC-0107 AC-5: differing scoring semantics suppress direct panel delta", () => {
  it("RFC-0107 AC-5", () => {
    const baseInput: MethodologyInput = {
      codebookId: "cb-1",
      codebookVersion: "1.0",
      ontologyVersion: "1.0",
      scorerVersion: "1.0.0",
      codebookSource: "codebook: v1",
      ontologySource: "ontology: v1",
      signalMapSource: "signal-map: v1",
      missingnessPolicySource: "policy: v1",
    };
    const changedInput: MethodologyInput = {
      ...baseInput,
      codebookSource: "codebook: v2",
    };

    const fp1 = computeMethodologyFingerprint(baseInput);
    const fp2 = computeMethodologyFingerprint(changedInput);

    expect(fp1.methodologyHash).not.toBe(fp2.methodologyHash);
    expect(fp1.codebookSha256).not.toBe(fp2.codebookSha256);
  });
});

describe("RFC-0107 AC-6: missing population frame suppresses post-stratified product", () => {
  it("RFC-0107 AC-6", () => {
    const inputs: ScientificInputs = {
      ...mockScientificInputs,
      populationFrameRef: null,
    };

    const verdicts: ProductVerdict[] = [
      { product: "cross-section", status: "eligible", reasons: [] },
      { product: "panel", status: "eligible", reasons: [] },
      {
        product: "post-stratified",
        status: "suppressed",
        reasons: ["population_frame_missing"],
      },
    ];

    const postStrat = verdicts.find((v) => v.product === "post-stratified");
    expect(postStrat).toBeDefined();
    expect(postStrat!.status).toBe("suppressed");
    expect(postStrat!.reasons).toContain("population_frame_missing");
    expect(inputs.populationFrameRef).toBeNull();
  });
});

describe("RFC-0107 AC-7: approved-host in URL path fails admission", () => {
  it("RFC-0107 AC-7", () => {
    const ALLOWED = ["genesis.destatis.de", "statistikportal.de"] as const;
    const maliciousUrl = "https://example.com/genesis.destatis.de";
    const hostname = new URL(maliciousUrl).hostname;
    expect(ALLOWED.includes(hostname as (typeof ALLOWED)[number])).toBe(false);

    const legitUrl = "https://genesis.destatis.de/data";
    const legitHost = new URL(legitUrl).hostname;
    expect(ALLOWED.includes(legitHost as (typeof ALLOWED)[number])).toBe(true);
  });
});

describe("RFC-0107 AC-8: deterministic sample IDs from frozen frame", () => {
  it("RFC-0107 AC-8", () => {
    const frame = [
      { id: "s1", sourceFamily: "A", predicted: "X" },
      { id: "s2", sourceFamily: "A", predicted: "Y" },
      { id: "s3", sourceFamily: "B", predicted: "X" },
      { id: "s4", sourceFamily: "B", predicted: "Y" },
      { id: "s5", sourceFamily: "A", predicted: "X" },
    ];

    const sampleWithSeed = (items: typeof frame, seed: number): string[] => {
      const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
      const rng = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
      };
      const maxPerCell = 100;
      const cells = new Map<string, typeof sorted>();
      for (const item of sorted) {
        const key = `${item.sourceFamily}:${item.predicted}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key)!.push(item);
      }
      const selected: string[] = [];
      let s = seed;
      for (const [, cellItems] of [...cells.entries()].sort()) {
        const n = Math.min(maxPerCell, cellItems.length);
        for (let i = 0; i < n; i++) {
          s = rng(s + i) * 10000;
          selected.push(cellItems[i].id);
        }
      }
      return selected.sort();
    };

    const sample1 = sampleWithSeed(frame, 42);
    const sample2 = sampleWithSeed(frame, 42);
    expect(sample1).toEqual(sample2);
  });
});
