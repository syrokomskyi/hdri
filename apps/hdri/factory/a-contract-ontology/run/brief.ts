/*
<MODULE_CONTRACT>
<purpose>Parse and validate the a-contract-ontology brief.md configuration — this module handles brief operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not manage filesystem I/O directly.</item>
  <item>Do not handle pipeline orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Make period regex case-insensitive to accept lowercase 'q' in YYYY-qn format.</item>
  <item>Normalize period to lowercase after validation — lowercase is the canonical format.</item>
  <item>Remove unused direct database paths; discovery is period-scoped and filesystem-derived.</item>
  <item>RFC-0046: add instrumentPlan field parsed from brief frontmatter with skipGogols consistency validation.</item>
</CHANGE_SUMMARY>
*/

import matter from "gray-matter";
import {
  parseInstrumentPlanFromFrontmatter,
  type InstrumentPlanEntry,
  type InstrumentId,
} from "@syrokomskyi/factory-core";
export type Brief = {
  /** Period in `yyyy-qn` format (lowercase q). Hard quarterly boundary for the contract bundle. */
  period: string;
  /** Semver of the ontology used to validate observations. */
  ontologyVersion: string;
  /** UUID v7 minted once for this quarterly capsule. */
  capsuleId: string;
  skipGogols: string[];
  /** Instrument plan for this quarter. Defaults to Lighthouse disabled. */
  instrumentPlan: InstrumentPlanEntry[];
};

const PERIOD_RE = /^(\d{4})-Q([1-4])$/i;

export const parseBriefMarkdown = (briefMd: string): Brief => {
  const parsed = matter(briefMd);
  const data = parsed.data as Record<string, unknown>;

  const periodRaw = typeof data.period === "string" ? data.period.trim() : "";
  if (!periodRaw || !PERIOD_RE.test(periodRaw)) {
    throw new Error('brief.md: period must be in YYYY-qn format (e.g. "2026-q2")');
  }
  const period = periodRaw.toLowerCase();

  const ontologyVersion =
    typeof data.ontologyVersion === "string" ? data.ontologyVersion.trim() || "1.0.0" : "1.0.0";

  const skipGogols = Array.isArray(data.skipGogols)
    ? data.skipGogols.filter((x): x is string => typeof x === "string")
    : [];

  const instrumentPlan = parseInstrumentPlanFromFrontmatter(data.instrumentPlan);

  const INSTRUMENT_GOGOL_MAP: Record<InstrumentId, string> = {
    liveness: "2-check-liveness",
    profile: "3-extract-profile",
    axe: "5-audit-axe",
    lighthouse: "4-audit-lighthouse",
  };
  for (const entry of instrumentPlan) {
    if (entry.state === "required" && skipGogols.includes(INSTRUMENT_GOGOL_MAP[entry.instrument])) {
      throw new Error(
        `brief.md: instrument "${entry.instrument}" is required but its gogol "${INSTRUMENT_GOGOL_MAP[entry.instrument]}" is in skipGogols`,
      );
    }
  }

  const getRequiredString = (value: unknown, name: string): string => {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`brief.md: ${name} must be a non-empty string`);
    }
    return value.trim();
  };
  const capsuleId = getRequiredString(data.capsuleId, "capsuleId").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(capsuleId)) {
    throw new Error("brief.md: capsuleId must be a UUID v7");
  }

  return {
    period,
    ontologyVersion,
    capsuleId,
    skipGogols,
    instrumentPlan,
  };
};
