/*
<MODULE_CONTRACT>
<purpose>Durable quarter ledger record and readiness receipt contracts for HDRI quarterly continuity — preserves collection lineage independently of publication.</purpose>
<non-goals>
  <item>Does not read files or verify evidence — callers supply evidence digests.</item>
  <item>Does not implement CLI commands or pipeline orchestration.</item>
  <item>Does not duplicate ProgramGate logic — ReadinessReceipt binds evidence digests, ProgramGate gates operations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0112: initial QuarterRecord and ReadinessReceipt contracts for quarterly continuity.</item>
  <item>Reject missing and mistyped persisted fields without coercing them into plausible identities.</item>
  <item>RFC-0113 A3: append-only quarter ledger with per-period immutable revisions, compare-and-swap transitions, and preserved old heads.</item>
</CHANGE_SUMMARY>
*/

export const QuarterRecordSchema = "hdri-quarter-record@1" as const;

export type QuarterCollectionStatus = "scheduled" | "collecting" | "sealed" | "gap";

export type QuarterPublicationStatus = "pending" | "suppressed" | "published";

export interface QuarterRecord {
  schema: typeof QuarterRecordSchema;
  period: string;
  capsuleId: string;
  predecessorPeriod: string | null;
  predecessorManifestSha256: string | null;
  collection: QuarterCollectionStatus;
  publication: QuarterPublicationStatus;
  checkpointSha256: string | null;
  gapDecisionSha256: string | null;
}

export type QuarterRecordDraft = Omit<QuarterRecord, "capsuleId"> & { capsuleId: "" };

export const ReadinessReceiptSchema = "hdri-quarter-readiness@1" as const;

export type ReadinessStatus = "ready" | "blocked";

export type ReadinessBlockerCode =
  | "MISSING_PRESERVATION_GATE"
  | "MISSING_QUALIFICATION"
  | "MISSING_PREDECESSOR"
  | "MISSING_CAPACITY_REPORT"
  | "OBSOLETE_RUNTIME_REMAINS";

export interface ReadinessReceipt {
  schema: typeof ReadinessReceiptSchema;
  period: string;
  preservationGateSha256: string;
  qualificationSha256: string;
  predecessorSha256: string;
  capacityReportSha256: string;
  status: ReadinessStatus;
  blockers: ReadinessBlockerCode[];
}

export interface ReadinessInput {
  period: string;
  preservationGateSha256: string;
  qualificationSha256: string;
  predecessorSha256: string;
  capacityReportSha256: string;
  obsoleteRuntimeRemaining: boolean;
}

const PERIOD_RE = /^\d{4}-q[1-4]$/;

export const validateQuarterRecord = (record: QuarterRecord): void => {
  if (record.schema !== QuarterRecordSchema) {
    throw new Error(
      `QuarterRecord: invalid schema "${record.schema}", expected "${QuarterRecordSchema}"`,
    );
  }
  if (!PERIOD_RE.test(record.period)) {
    throw new Error(`QuarterRecord: invalid period "${record.period}"`);
  }
  if (typeof record.capsuleId !== "string" || record.capsuleId.length === 0) {
    throw new Error("QuarterRecord: capsuleId must be a non-empty string");
  }
  if (record.predecessorPeriod !== null && !PERIOD_RE.test(record.predecessorPeriod)) {
    throw new Error(`QuarterRecord: invalid predecessorPeriod "${record.predecessorPeriod}"`);
  }
  if (!["scheduled", "collecting", "sealed", "gap"].includes(record.collection)) {
    throw new Error(`QuarterRecord: invalid collection status "${record.collection}"`);
  }
  if (!["pending", "suppressed", "published"].includes(record.publication)) {
    throw new Error(`QuarterRecord: invalid publication status "${record.publication}"`);
  }
  for (const field of [
    "predecessorManifestSha256",
    "checkpointSha256",
    "gapDecisionSha256",
  ] as const) {
    const value = record[field];
    if (value !== null && (typeof value !== "string" || value.trim().length === 0)) {
      throw new Error(`QuarterRecord: ${field} must be a non-empty string or null`);
    }
  }
};

export const parseQuarterRecord = (raw: string): QuarterRecord => {
  // @ai-invariant: Missing provenance remains invalid, never a coerced string or implicit null.
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("QuarterRecord: expected an object");
  }
  const fields = parsed as Record<string, unknown>;
  if (fields.schema !== QuarterRecordSchema) {
    throw new Error(`QuarterRecord: unsupported schema "${fields.schema}"`);
  }
  for (const field of ["period", "capsuleId", "collection", "publication"]) {
    if (typeof fields[field] !== "string") throw new Error(`QuarterRecord: invalid ${field}`);
  }
  for (const field of [
    "predecessorPeriod",
    "predecessorManifestSha256",
    "checkpointSha256",
    "gapDecisionSha256",
  ]) {
    if (fields[field] !== null && typeof fields[field] !== "string") {
      throw new Error(`QuarterRecord: invalid ${field}`);
    }
  }
  const record: QuarterRecord = {
    schema: QuarterRecordSchema,
    period: fields.period as string,
    capsuleId: fields.capsuleId as string,
    predecessorPeriod: fields.predecessorPeriod as string | null,
    predecessorManifestSha256: fields.predecessorManifestSha256 as string | null,
    collection: fields.collection as QuarterCollectionStatus,
    publication: fields.publication as QuarterPublicationStatus,
    checkpointSha256: fields.checkpointSha256 as string | null,
    gapDecisionSha256: fields.gapDecisionSha256 as string | null,
  };
  validateQuarterRecord(record);
  return record;
};

export const serializeQuarterRecord = (record: QuarterRecord): string => {
  validateQuarterRecord(record);
  return `${JSON.stringify(record, null, 2)}\n`;
};

// ---------------------------------------------------------------------------
// Append-only quarter ledger (RFC-0113 A3)
// ---------------------------------------------------------------------------

export const QuarterLedgerIndexSchema = "hdri-quarter-ledger-index@1" as const;

export interface QuarterRecordRevision {
  schema: typeof QuarterRecordSchema;
  revision: number;
  record: QuarterRecord;
  previousRevisionDigest: string | null;
  createdAt: string;
}

export interface QuarterLedgerIndex {
  schema: typeof QuarterLedgerIndexSchema;
  period: string;
  headRevision: number;
  headDigest: string;
  revisions: { revision: number; digest: string; createdAt: string }[];
}

export const validateQuarterRecordRevision = (rev: QuarterRecordRevision): void => {
  if (rev.schema !== QuarterRecordSchema) {
    throw new Error(`QuarterRecordRevision: invalid schema "${rev.schema}"`);
  }
  if (typeof rev.revision !== "number" || rev.revision < 0 || !Number.isInteger(rev.revision)) {
    throw new Error(`QuarterRecordRevision: revision must be a non-negative integer`);
  }
  validateQuarterRecord(rev.record);
  if (
    rev.previousRevisionDigest !== null &&
    (typeof rev.previousRevisionDigest !== "string" || rev.previousRevisionDigest.length === 0)
  ) {
    throw new Error(
      `QuarterRecordRevision: previousRevisionDigest must be a non-empty string or null`,
    );
  }
  if (typeof rev.createdAt !== "string" || rev.createdAt.length === 0) {
    throw new Error(`QuarterRecordRevision: createdAt must be a non-empty string`);
  }
};

export const serializeQuarterRecordRevision = (rev: QuarterRecordRevision): string => {
  validateQuarterRecordRevision(rev);
  return `${JSON.stringify(rev, null, 2)}\n`;
};

export const parseQuarterRecordRevision = (raw: string): QuarterRecordRevision => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("QuarterRecordRevision: expected an object");
  }
  const f = parsed as Record<string, unknown>;
  if (f.schema !== QuarterRecordSchema) {
    throw new Error(`QuarterRecordRevision: unsupported schema "${f.schema}"`);
  }
  if (typeof f.revision !== "number" || !Number.isInteger(f.revision)) {
    throw new Error("QuarterRecordRevision: invalid revision");
  }
  if (f.previousRevisionDigest !== null && typeof f.previousRevisionDigest !== "string") {
    throw new Error("QuarterRecordRevision: invalid previousRevisionDigest");
  }
  if (typeof f.createdAt !== "string") {
    throw new Error("QuarterRecordRevision: invalid createdAt");
  }
  const record = parseQuarterRecord(JSON.stringify(f.record));
  return {
    schema: QuarterRecordSchema,
    revision: f.revision,
    record,
    previousRevisionDigest: f.previousRevisionDigest as string | null,
    createdAt: f.createdAt,
  };
};

export const validateQuarterLedgerIndex = (index: QuarterLedgerIndex): void => {
  if (index.schema !== QuarterLedgerIndexSchema) {
    throw new Error(
      `QuarterLedgerIndex: invalid schema "${index.schema}", expected "${QuarterLedgerIndexSchema}"`,
    );
  }
  if (!PERIOD_RE.test(index.period)) {
    throw new Error(`QuarterLedgerIndex: invalid period "${index.period}"`);
  }
  if (typeof index.headRevision !== "number" || index.headRevision < 0) {
    throw new Error("QuarterLedgerIndex: headRevision must be a non-negative number");
  }
  if (typeof index.headDigest !== "string" || index.headDigest.length === 0) {
    throw new Error("QuarterLedgerIndex: headDigest must be a non-empty string");
  }
  if (!Array.isArray(index.revisions)) {
    throw new Error("QuarterLedgerIndex: revisions must be an array");
  }
  for (const r of index.revisions) {
    if (
      typeof r.revision !== "number" ||
      typeof r.digest !== "string" ||
      typeof r.createdAt !== "string"
    ) {
      throw new Error("QuarterLedgerIndex: invalid revision entry");
    }
  }
};

export const serializeQuarterLedgerIndex = (index: QuarterLedgerIndex): string => {
  validateQuarterLedgerIndex(index);
  return `${JSON.stringify(index, null, 2)}\n`;
};

export const parseQuarterLedgerIndex = (raw: string): QuarterLedgerIndex => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("QuarterLedgerIndex: expected an object");
  }
  const f = parsed as Record<string, unknown>;
  if (f.schema !== QuarterLedgerIndexSchema) {
    throw new Error(`QuarterLedgerIndex: unsupported schema "${f.schema}"`);
  }
  if (typeof f.period !== "string") throw new Error("QuarterLedgerIndex: invalid period");
  if (typeof f.headRevision !== "number")
    throw new Error("QuarterLedgerIndex: invalid headRevision");
  if (typeof f.headDigest !== "string") throw new Error("QuarterLedgerIndex: invalid headDigest");
  if (!Array.isArray(f.revisions)) throw new Error("QuarterLedgerIndex: invalid revisions");
  const index: QuarterLedgerIndex = {
    schema: QuarterLedgerIndexSchema,
    period: f.period,
    headRevision: f.headRevision,
    headDigest: f.headDigest,
    revisions: f.revisions as QuarterLedgerIndex["revisions"],
  };
  validateQuarterLedgerIndex(index);
  return index;
};

export const computeRevisionDigest = (rev: QuarterRecordRevision): string => {
  const content = serializeQuarterRecordRevision(rev).trim();
  // Simple hash for digest — callers can use crypto.createHash in Node
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return `rev-${rev.revision}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const createQuarterRevision = (
  record: QuarterRecord,
  previousRevision: QuarterRecordRevision | null,
): QuarterRecordRevision => {
  validateQuarterRecord(record);
  const revision = previousRevision ? previousRevision.revision + 1 : 0;
  const previousRevisionDigest = previousRevision ? computeRevisionDigest(previousRevision) : null;
  return {
    schema: QuarterRecordSchema,
    revision,
    record,
    previousRevisionDigest,
    createdAt: new Date().toISOString(),
  };
};

export const createQuarterLedgerIndex = (
  period: string,
  revision: QuarterRecordRevision,
): QuarterLedgerIndex => {
  const digest = computeRevisionDigest(revision);
  return {
    schema: QuarterLedgerIndexSchema,
    period,
    headRevision: revision.revision,
    headDigest: digest,
    revisions: [{ revision: revision.revision, digest, createdAt: revision.createdAt }],
  };
};

export const advanceQuarterLedgerIndex = (
  index: QuarterLedgerIndex,
  revision: QuarterRecordRevision,
): QuarterLedgerIndex => {
  const digest = computeRevisionDigest(revision);
  const updated: QuarterLedgerIndex = {
    schema: QuarterLedgerIndexSchema,
    period: index.period,
    headRevision: revision.revision,
    headDigest: digest,
    revisions: [
      ...index.revisions,
      { revision: revision.revision, digest, createdAt: revision.createdAt },
    ],
  };
  validateQuarterLedgerIndex(updated);
  return updated;
};

export const createReadinessReceipt = (input: ReadinessInput): ReadinessReceipt => {
  const blockers: ReadinessBlockerCode[] = [];

  if (!input.preservationGateSha256) {
    blockers.push("MISSING_PRESERVATION_GATE");
  }
  if (!input.qualificationSha256) {
    blockers.push("MISSING_QUALIFICATION");
  }
  if (!input.predecessorSha256) {
    blockers.push("MISSING_PREDECESSOR");
  }
  if (!input.capacityReportSha256) {
    blockers.push("MISSING_CAPACITY_REPORT");
  }
  if (input.obsoleteRuntimeRemaining) {
    blockers.push("OBSOLETE_RUNTIME_REMAINS");
  }

  return {
    schema: ReadinessReceiptSchema,
    period: input.period,
    preservationGateSha256: input.preservationGateSha256,
    qualificationSha256: input.qualificationSha256,
    predecessorSha256: input.predecessorSha256,
    capacityReportSha256: input.capacityReportSha256,
    status: blockers.length > 0 ? "blocked" : "ready",
    blockers,
  };
};

export const validateReadinessReceipt = (receipt: ReadinessReceipt): void => {
  if (receipt.schema !== ReadinessReceiptSchema) {
    throw new Error(
      `ReadinessReceipt: invalid schema "${receipt.schema}", expected "${ReadinessReceiptSchema}"`,
    );
  }
  if (!PERIOD_RE.test(receipt.period)) {
    throw new Error(`ReadinessReceipt: invalid period "${receipt.period}"`);
  }
  if (!["ready", "blocked"].includes(receipt.status)) {
    throw new Error(`ReadinessReceipt: invalid status "${receipt.status}"`);
  }
  if (receipt.status === "ready" && receipt.blockers.length > 0) {
    throw new Error("ReadinessReceipt: status is ready but blockers are non-empty");
  }
  if (receipt.status === "blocked" && receipt.blockers.length === 0) {
    throw new Error("ReadinessReceipt: status is blocked but blockers are empty");
  }
};
