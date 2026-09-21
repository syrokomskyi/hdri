/*
<MODULE_CONTRACT>
<purpose>Canonical content digests for the 8 methodology-identity components (RFC-0107). Two
conventions, per the RFC's "archive both source bytes and canonical semantic digests":
(1) raw source bytes → sha256 for declarative artifacts (codebook, ontology, policy docs);
(2) canonical semantic digest → sha256 for code components whose bytes legitimately drift
(signal map, scoring semantics) — the digest captures WHAT the code does, not how it is formatted.</purpose>
<non-goals>
  <item>Does not decide comparability — that is methodology-comparison.ts.</item>
  <item>Does not read the DB or vault — the caller supplies sources.</item>
</non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Q2↔Q3 comparability: canonical digests for all 8 methodology components. scoringSemantics
  is a behavioral fingerprint (scoreSite over a codebook-derived probe matrix) so a cosmetic or
  refactored scoring engine with identical behavior hashes identically; signalMap is a canonical
  JSON digest of the exported maps.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { AXE_SIGNAL_MAP, EXT_SIGNAL_MAP } from "@syrokomskyi/observatory-core";
import { parseCodebookOrThrow, scoreSite } from "@syrokomskyi/hdri-codebook";
import { canonicalJson } from "../../run/score/methodology-core";
import { signalMapSource } from "../../run/score/methodology-sources";
import type {
  Codebook,
  Indicator,
  ScoringRule,
  SignalValue,
  SiteSignals,
  SignalCollectionReason,
} from "@syrokomskyi/hdri-codebook";

export const sha256hex = (content: string | Buffer): string =>
  createHash("sha256").update(content).digest("hex");

// canonicalJson lives in run/score/methodology-core.ts and signalMapSource in
// run/score/methodology-sources.ts — the run fingerprint and this snapshot producer must
// digest identical canonical bytes (single implementation, RFC-0107).
export { canonicalJson, signalMapSource };

// --- Signal map -------------------------------------------------------------
// The map lives in TypeScript source, so raw bytes drift with formatting. The semantic
// content is the exported mapping itself — canonical JSON of {ext, axe} is the digest.
export type SignalMapLike = ReadonlyArray<unknown>;

export const signalMapDigest = (
  ext: SignalMapLike = EXT_SIGNAL_MAP,
  axe: SignalMapLike = AXE_SIGNAL_MAP,
): string => sha256hex(signalMapSource(ext, axe));

// --- Scoring semantics ------------------------------------------------------
// "Scoring semantics" = the function (signals, codebook) → score. A behavioral fingerprint:
// run scoreSite over a deterministic probe matrix derived from the codebook and hash the
// canonical outputs. Identical behavior → identical digest even when the source is refactored.
type ScoreSiteFn = (
  signals: SiteSignals,
  codebook: Codebook,
  options?: { signalStatuses?: Readonly<Record<string, SignalCollectionReason>> },
) => unknown;
type ParseFn = (source: string, pathHint?: string) => Codebook;

const presentValue = (rule: ScoringRule): SignalValue => {
  switch (rule.type) {
    case "bool":
      return true;
    case "presence":
      return "present";
    case "countClamp":
    case "countClampInverse":
      return Math.floor((rule.min + rule.max) / 2);
    case "enum":
      return Object.keys(rule.cases)[0];
  }
};

const variants = (rule: ScoringRule): SignalValue[] => {
  switch (rule.type) {
    case "bool":
      return [true, false, 1, 0, "true", "false", "yes", "no", null];
    case "presence":
      return ["x", "", null, 0, false];
    case "countClamp":
    case "countClampInverse":
      return [
        rule.min - 1,
        rule.min,
        Math.floor((rule.min + rule.max) / 2),
        rule.max,
        rule.max + 1,
        "5",
        null,
      ];
    case "enum":
      return [...Object.keys(rule.cases), "__unknown__", null];
  }
};

const CONDITIONAL_STATES: SignalCollectionReason[] = [
  "absent",
  "unreachable",
  "forbidden",
  "not_applicable",
];

type Probe = {
  name: string;
  signals: SiteSignals;
  statuses?: Record<string, SignalCollectionReason>;
};

/** Deterministic probe matrix covering every indicator × rule variant × missing/conditional state. */
export const buildScoringProbes = (codebook: Codebook): Probe[] => {
  const indicators: Indicator[] = codebook.dimensions.flatMap((d) => d.indicators);
  const base: Record<string, SignalValue> = {};
  for (const ind of indicators) base[ind.inputKey] = presentValue(ind.rule);

  const probes: Probe[] = [
    { name: "all-present", signals: { ...base } },
    { name: "all-missing", signals: {} },
  ];
  for (const ind of indicators) {
    const missingSignals = { ...base };
    delete missingSignals[ind.inputKey];
    probes.push({ name: `missing:${ind.id}`, signals: missingSignals });
    for (const v of variants(ind.rule)) {
      probes.push({
        name: `value:${ind.id}=${JSON.stringify(v)}`,
        signals: { ...base, [ind.inputKey]: v },
      });
    }
    if (ind.missing.kind === "conditional") {
      for (const state of CONDITIONAL_STATES) {
        probes.push({
          name: `status:${ind.id}=${state}`,
          signals: { ...missingSignals },
          statuses: { [ind.inputKey]: state },
        });
      }
    }
  }
  return probes;
};

/**
 * Behavioral fingerprint of the scoring engine over the probe matrix. Injectable parse/score
 * let the SAME digest be computed against a recovered earlier engine (e.g. Q2) — the digest is
 * comparable iff the probe generator and codebook are identical, which they are by construction.
 */
export const scoringSemanticsDigest = (
  codebookSource: string,
  parse: ParseFn = parseCodebookOrThrow,
  score: ScoreSiteFn = scoreSite,
): string => {
  const codebook = parse(codebookSource, "codebook.yaml");
  const results = buildScoringProbes(codebook).map((p) => ({
    name: p.name,
    out: score(p.signals, codebook, { signalStatuses: p.statuses }),
  }));
  return sha256hex(canonicalJson(results));
};
