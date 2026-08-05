/*
<MODULE_CONTRACT>
<purpose>Defines forward-only HDRI quarter, capsule, source-ledger and resumable-work contracts.</purpose>
<non-goals><item>Does not read legacy yearly outputs or perform network capture.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0024 through RFC-0027 establish immutable quarterly boundaries.</item>
  <item>RFC-0046: make instrument plan configurable — remove QUARTER_INSTRUMENT_PLAN_VERSION, add KNOWN_INSTRUMENTS, DEFAULT_INSTRUMENT_PLAN, validateInstrumentPlan, capsuleConfigSha256 accepts plan parameter.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";

export type HdriPeriod = `${number}-q${1 | 2 | 3 | 4}`;
export type ProvisionalAssetId = `da-${string}`;
export type SourceBatchId = string;
export type SourceOccurrenceId = string;
export type CapsuleId = string;
export type InstrumentId = "liveness" | "profile" | "axe" | "lighthouse";

export const KNOWN_INSTRUMENTS: readonly InstrumentId[] = [
  "liveness",
  "profile",
  "axe",
  "lighthouse",
];

const PERIOD = /^\d{4}-q[1-4]$/;

export const assertHdriPeriod = (period: string): asserts period is HdriPeriod => {
  if (!PERIOD.test(period)) throw new Error(`Invalid HDRI period: ${period}`);
};

export const assertCapsuleId = (capsuleId: string): void => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(capsuleId)) {
    throw new Error("capsuleId must be a UUID v7");
  }
};

import type { InstrumentPlanEntry } from "./capsule.js";

export const DEFAULT_INSTRUMENT_PLAN: readonly InstrumentPlanEntry[] = [
  { instrument: "liveness", state: "required", reason: null },
  { instrument: "profile", state: "required", reason: null },
  { instrument: "axe", state: "required", reason: null },
  {
    instrument: "lighthouse",
    state: "disabled",
    reason: "Not configured in brief — default disabled",
  },
] as const;

export const validateInstrumentPlan = (plan: readonly InstrumentPlanEntry[]): void => {
  const seen = new Set<InstrumentId>();
  for (const entry of plan) {
    if (!KNOWN_INSTRUMENTS.includes(entry.instrument))
      throw new Error(`Unknown instrument in plan: ${entry.instrument}`);
    if (seen.has(entry.instrument))
      throw new Error(`Duplicate instrument in plan: ${entry.instrument}`);
    seen.add(entry.instrument);
    if (entry.state !== "required" && entry.state !== "disabled")
      throw new Error(`Invalid instrument state for ${entry.instrument}: ${entry.state}`);
    if (entry.state === "disabled" && (!entry.reason || entry.reason.trim().length === 0))
      throw new Error(`Disabled instrument requires non-empty reason: ${entry.instrument}`);
    if (entry.state === "required" && entry.reason !== null)
      throw new Error(`Required instrument must have null reason: ${entry.instrument}`);
  }
  for (const id of KNOWN_INSTRUMENTS) {
    if (!seen.has(id)) throw new Error(`Instrument plan missing entry for: ${id}`);
  }
};

export const parseInstrumentPlanFromFrontmatter = (raw: unknown): InstrumentPlanEntry[] => {
  if (raw === undefined || raw === null) return [...DEFAULT_INSTRUMENT_PLAN];
  if (!Array.isArray(raw)) throw new Error("brief.md: instrumentPlan must be an array");
  const plan: InstrumentPlanEntry[] = raw.map((entry, i) => {
    if (typeof entry !== "object" || entry === null)
      throw new Error(`brief.md: instrumentPlan[${i}] must be an object`);
    const e = entry as Record<string, unknown>;
    const instrument = e.instrument;
    const state = e.state;
    const reason = e.reason;
    if (typeof instrument !== "string")
      throw new Error(`brief.md: instrumentPlan[${i}].instrument must be a string`);
    if (!KNOWN_INSTRUMENTS.includes(instrument as InstrumentId))
      throw new Error(
        `brief.md: instrumentPlan[${i}].instrument must be one of: ${KNOWN_INSTRUMENTS.join(", ")}`,
      );
    if (state !== "required" && state !== "disabled")
      throw new Error(`brief.md: instrumentPlan[${i}].state must be "required" or "disabled"`);
    if (reason !== null && typeof reason !== "string")
      throw new Error(`brief.md: instrumentPlan[${i}].reason must be a string or null`);
    return { instrument: instrument as InstrumentId, state, reason: reason as string | null };
  });
  validateInstrumentPlan(plan);
  return plan;
};

export const capsuleConfigSha256 = (
  period: HdriPeriod,
  capsuleId: CapsuleId,
  instrumentPlan: readonly InstrumentPlanEntry[],
): string =>
  createHash("sha256")
    .update(`hdri:capsule-config:v2\0${period}\0${capsuleId}\0${JSON.stringify(instrumentPlan)}`)
    .digest("hex");

export const sourceOccurrenceId = (
  batchHash: string,
  sourceFileSha256: string,
  sourceItemKey: string,
): SourceOccurrenceId =>
  `so-${createHash("sha256")
    .update(`hdri:source-occurrence:v1\0${batchHash}\0${sourceFileSha256}\0${sourceItemKey}`)
    .digest("hex")}`;

export const canonicalResumeKey = (parts: readonly string[]): string =>
  Buffer.concat(
    parts.map((part) => {
      const bytes = Buffer.from(part, "utf8");
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(bytes.length);
      return Buffer.concat([length, bytes]);
    }),
  ).toString("hex");

export const assertRelativeArtifactUri = (uri: string): void => {
  if (!uri || uri.startsWith("/") || uri.includes("\\") || uri.split("/").includes("..")) {
    throw new Error(`Artifact URI must be a root-relative portable path: ${uri}`);
  }
};

export type SourceBatchManifest = Readonly<{
  schemaVersion: "1";
  batchId: SourceBatchId;
  periodAdded: HdriPeriod;
  batchHash: string;
  files: readonly Readonly<{
    relativePath: string;
    sha256: string;
    bytes: number;
    parserId: string;
    parserVersion: string;
  }>[];
}>;

export type WorkKey = Readonly<{
  period: HdriPeriod;
  capsuleId: CapsuleId;
  stageId:
    "frame" | "liveness" | "profile" | "axe" | "lighthouse" | "translate" | "emit" | "verify";
  provisionalAssetId: ProvisionalAssetId;
  instrumentVersion: string;
}>;

export type WorkState =
  "pending" | "leased" | "retryable" | "succeeded" | "observed-failure" | "quarantined";

export const isTerminalWorkState = (state: WorkState): boolean =>
  state === "succeeded" || state === "observed-failure" || state === "quarantined";

export const profileEligible = (
  outcome: "reachable" | "unavailable" | "blocked" | "indeterminate",
): boolean => outcome === "reachable";
