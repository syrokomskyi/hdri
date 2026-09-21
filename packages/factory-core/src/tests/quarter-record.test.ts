import { describe, it, expect } from "vitest";
import {
  QuarterRecordSchema,
  ReadinessReceiptSchema,
  validateQuarterRecord,
  parseQuarterRecord,
  serializeQuarterRecord,
  createReadinessReceipt,
  validateReadinessReceipt,
  type QuarterRecord,
  type ReadinessInput,
} from "../lib/quarter-record.js";
import {
  computePredecessorPeriod,
  discoverQuarterRecord,
  type PriorCapsulesFile,
} from "../lib/prior-capsules.js";

describe("QuarterRecord", () => {
  const validRecord: QuarterRecord = {
    schema: QuarterRecordSchema,
    period: "2026-q4",
    capsuleId: "0198faaa-0000-7000-8000-000000000000",
    predecessorPeriod: "2026-q3",
    predecessorManifestSha256: "abc123",
    collection: "scheduled",
    publication: "pending",
    checkpointSha256: null,
    gapDecisionSha256: null,
  };

  it("validates a correct record", () => {
    expect(() => validateQuarterRecord(validRecord)).not.toThrow();
  });

  it("rejects invalid schema", () => {
    expect(() => validateQuarterRecord({ ...validRecord, schema: "wrong" as never })).toThrow(
      /invalid schema/,
    );
  });

  it("rejects invalid period", () => {
    expect(() => validateQuarterRecord({ ...validRecord, period: "2026-q5" })).toThrow(
      /invalid period/,
    );
  });

  it("rejects empty capsuleId", () => {
    expect(() => validateQuarterRecord({ ...validRecord, capsuleId: "" })).toThrow(/capsuleId/);
  });

  it("rejects invalid collection status", () => {
    expect(() => validateQuarterRecord({ ...validRecord, collection: "invalid" as never })).toThrow(
      /collection status/,
    );
  });

  it("rejects invalid publication status", () => {
    expect(() =>
      validateQuarterRecord({ ...validRecord, publication: "invalid" as never }),
    ).toThrow(/publication status/);
  });

  it("parses valid JSON", () => {
    const raw = JSON.stringify(validRecord, null, 2);
    const parsed = parseQuarterRecord(raw);
    expect(parsed.period).toBe(validRecord.period);
    expect(parsed.capsuleId).toBe(validRecord.capsuleId);
  });

  it.each([undefined, null, 42, {}, []])("rejects a non-string capsule identity: %j", (capsuleId) => {
    expect(() => parseQuarterRecord(JSON.stringify({ ...validRecord, capsuleId }))).toThrow();
  });

  it("rejects missing nullable provenance fields instead of stringifying undefined", () => {
    const { checkpointSha256: _checkpoint, ...incomplete } = validRecord;
    expect(() => parseQuarterRecord(JSON.stringify(incomplete))).toThrow(/checkpointSha256/);
  });

  it("rejects unsupported schema in parse", () => {
    expect(() => parseQuarterRecord('{"schema":"wrong"}')).toThrow(/unsupported schema/);
  });

  it("serializes and round-trips", () => {
    const serialized = serializeQuarterRecord(validRecord);
    const reparsed = parseQuarterRecord(serialized);
    expect(reparsed).toEqual(validRecord);
  });
});

describe("ReadinessReceipt", () => {
  const fullInput: ReadinessInput = {
    period: "2026-q4",
    preservationGateSha256: "preserve-hash",
    qualificationSha256: "qual-hash",
    predecessorSha256: "pred-hash",
    capacityReportSha256: "cap-hash",
    obsoleteRuntimeRemaining: false,
  };

  it("returns ready when all evidence is present and no obsolete runtime", () => {
    const receipt = createReadinessReceipt(fullInput);
    expect(receipt.status).toBe("ready");
    expect(receipt.blockers).toEqual([]);
    expect(receipt.schema).toBe(ReadinessReceiptSchema);
  });

  it("returns blocked when preservation gate evidence is missing", () => {
    const receipt = createReadinessReceipt({
      ...fullInput,
      preservationGateSha256: "",
    });
    expect(receipt.status).toBe("blocked");
    expect(receipt.blockers).toContain("MISSING_PRESERVATION_GATE");
  });

  it("returns blocked when qualification evidence is missing", () => {
    const receipt = createReadinessReceipt({
      ...fullInput,
      qualificationSha256: "",
    });
    expect(receipt.status).toBe("blocked");
    expect(receipt.blockers).toContain("MISSING_QUALIFICATION");
  });

  it("returns blocked when predecessor evidence is missing", () => {
    const receipt = createReadinessReceipt({
      ...fullInput,
      predecessorSha256: "",
    });
    expect(receipt.status).toBe("blocked");
    expect(receipt.blockers).toContain("MISSING_PREDECESSOR");
  });

  it("returns blocked when capacity report is missing", () => {
    const receipt = createReadinessReceipt({
      ...fullInput,
      capacityReportSha256: "",
    });
    expect(receipt.status).toBe("blocked");
    expect(receipt.blockers).toContain("MISSING_CAPACITY_REPORT");
  });

  it("returns blocked when obsolete runtime remains", () => {
    const receipt = createReadinessReceipt({
      ...fullInput,
      obsoleteRuntimeRemaining: true,
    });
    expect(receipt.status).toBe("blocked");
    expect(receipt.blockers).toContain("OBSOLETE_RUNTIME_REMAINS");
  });

  it("validates a correct ready receipt", () => {
    const receipt = createReadinessReceipt(fullInput);
    expect(() => validateReadinessReceipt(receipt)).not.toThrow();
  });

  it("rejects invalid schema in validate", () => {
    const receipt = createReadinessReceipt(fullInput);
    expect(() => validateReadinessReceipt({ ...receipt, schema: "wrong" as never })).toThrow(
      /invalid schema/,
    );
  });

  it("rejects ready status with non-empty blockers", () => {
    expect(() =>
      validateReadinessReceipt({
        schema: ReadinessReceiptSchema,
        period: "2026-q4",
        preservationGateSha256: "x",
        qualificationSha256: "x",
        predecessorSha256: "x",
        capacityReportSha256: "x",
        status: "ready",
        blockers: ["MISSING_QUALIFICATION" as never],
      }),
    ).toThrow(/ready but blockers/);
  });

  it("rejects blocked status with empty blockers", () => {
    expect(() =>
      validateReadinessReceipt({
        schema: ReadinessReceiptSchema,
        period: "2026-q4",
        preservationGateSha256: "x",
        qualificationSha256: "x",
        predecessorSha256: "x",
        capacityReportSha256: "x",
        status: "blocked",
        blockers: [],
      }),
    ).toThrow(/blocked but blockers/);
  });
});

describe("computePredecessorPeriod", () => {
  it("Q1 → previous year Q4", () => {
    expect(computePredecessorPeriod("2027-q1")).toBe("2026-q4");
  });

  it("Q2 → same year Q1", () => {
    expect(computePredecessorPeriod("2026-q2")).toBe("2026-q1");
  });

  it("Q3 → same year Q2", () => {
    expect(computePredecessorPeriod("2026-q3")).toBe("2026-q2");
  });

  it("Q4 → same year Q3", () => {
    expect(computePredecessorPeriod("2026-q4")).toBe("2026-q3");
  });

  it("throws on invalid period", () => {
    expect(() => computePredecessorPeriod("invalid")).toThrow(/Invalid HDRI period/);
  });
});

describe("discoverQuarterRecord", () => {
  const priorCapsulesFile: PriorCapsulesFile = {
    schemaVersion: "1",
    currentPeriod: "2027-q1",
    priorCapsules: [
      {
        period: "2026-q4",
        capsuleId: "0198faaa-0000-7000-8000-000000000001",
        manifestPath: "path/to/capsule-q4.json",
        sourceLedgerHead: "ledger-head-q4",
        frameId: "frame-q4",
        batchIds: ["batch-1", "batch-2"],
      },
      {
        period: "2026-q3",
        capsuleId: "0198faaa-0000-7000-8000-000000000002",
        manifestPath: "path/to/capsule-q3.json",
        sourceLedgerHead: "ledger-head-q3",
        frameId: "frame-q3",
        batchIds: ["batch-3"],
      },
    ],
  };

  it("finds predecessor across year boundary (Q1 after Q4)", () => {
    const record = discoverQuarterRecord(priorCapsulesFile, "2027-q1");
    expect(record.predecessorPeriod).toBe("2026-q4");
    expect(record.predecessorManifestSha256).toBe("ledger-head-q4");
    expect(record.collection).toBe("scheduled");
  });

  it("finds predecessor within same year", () => {
    const record = discoverQuarterRecord(priorCapsulesFile, "2026-q4");
    expect(record.predecessorPeriod).toBe("2026-q3");
    expect(record.predecessorManifestSha256).toBe("ledger-head-q3");
  });

  it("returns gap record when predecessor is missing", () => {
    const record = discoverQuarterRecord(priorCapsulesFile, "2026-q2");
    expect(record.predecessorPeriod).toBe("2026-q1");
    expect(record.predecessorManifestSha256).toBeNull();
    expect(record.collection).toBe("gap");
  });

  it("throws on invalid period", () => {
    expect(() => discoverQuarterRecord(priorCapsulesFile, "invalid")).toThrow(
      /Invalid HDRI period/,
    );
  });
});
