import { describe, expect, it } from "vitest";
import { accumulateFileResult } from "../gogols/parse-sources-report.js";
import type { BatchReport, FileResult } from "../gogols/parse-sources-types.js";

describe("parse source QC arithmetic", () => {
  it("counts every skip reason exactly once", () => {
    const report: BatchReport = {
      batchName: "2026-q3-de-01",
      sourceFiles: [],
      noUrlWarnings: 0,
      skipSummary: { noUrl: 0, badUrl: 0, stopDomain: 0 },
      warnings: [],
    };
    const result: FileResult = {
      stat: {
        path: "2026-q3-de-01/source/a.csv",
        type: "csv",
        itemsParsed: 6,
        itemsRegistered: 3,
        itemsSkipped: 3,
        noUrl: 1,
        badUrl: 1,
        stopDomain: 1,
      },
      noUrlWarnings: 2,
      skipSummary: { noUrl: 1, badUrl: 1, stopDomain: 1 },
    };
    accumulateFileResult(report, result);
    expect(report.skipSummary).toEqual({ noUrl: 1, badUrl: 1, stopDomain: 1 });
    expect(report.noUrlWarnings).toBe(2);
  });
});
