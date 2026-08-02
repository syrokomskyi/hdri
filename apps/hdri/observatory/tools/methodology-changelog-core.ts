/*
<MODULE_CONTRACT>
<purpose>Methodology changelog (WP15): turn the per-run frozen methodology records (WP12
run_methodology + the WP15 frame hash) into an append-only, period-ordered changelog that states
exactly what changed between one published period and the next — codebook/ontology/scorer version
bumps, content-hash changes, and frame changes. This is the human- and machine-readable record of
how the instrument evolved, the companion to the immutable per-period content snapshots.</purpose>
<non-goals>
  <item>Does not read the DB or files — the caller supplies the records (from run_methodology).</item>
  <item>Does not freeze content — that is methodology-snapshot-core.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP15: initial methodology changelog generator.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import { parsePeriod } from "@syrokomskyi/observatory-core";

/** One published period's frozen methodology (a run_methodology row joined to its published run). */
export type MethodologyRecord = {
  period: string;
  runId: string;
  methodologyHash: string;
  codebookId: string;
  codebookVersion: string;
  ontologyVersion: string;
  scorerVersion: string;
  codebookSha256: string;
  ontologySha256: string | null;
  frameSha256: string | null;
  frozenAt: string;
};

export type FieldChange = {
  field:
    | "codebook_version"
    | "ontology_version"
    | "scorer_version"
    | "codebook_content"
    | "ontology_content"
    | "frame";
  from: string | null;
  to: string | null;
};

export type ChangelogEntry = {
  period: string;
  previousPeriod: string | null;
  methodologyHash: string;
  codebookId: string;
  codebookVersion: string;
  ontologyVersion: string;
  scorerVersion: string;
  frozenAt: string;
  /** "baseline" (first period), "unchanged", or "changed" vs the previous period. */
  status: "baseline" | "unchanged" | "changed";
  /** Whether the WP12 scoring identity (methodology_hash) changed — the comparability break flag. */
  comparabilityBreak: boolean;
  changes: FieldChange[];
};

const periodOrder = (p: string): number => {
  const { year, quarter } = parsePeriod(p);
  return year * 4 + quarter;
};

/**
 * Builds the period-ordered changelog. Records are sorted by period; each entry diffs against the
 * immediately-prior period. The first period is the "baseline". A change to `methodology_hash`
 * (codebook/ontology content or version, or scorer version) is flagged as a comparability break —
 * cross-period score deltas across it are not apples-to-apples. A frame-only change is recorded
 * but is NOT a comparability break (the frame reweights headline numbers, it does not re-score).
 *
 * If multiple records share a period (e.g. a superseded then a republished run), the LATEST by
 * frozenAt wins — the changelog reflects the currently-published methodology for each period.
 */
export function buildChangelog(records: MethodologyRecord[]): ChangelogEntry[] {
  const latestByPeriod = new Map<string, MethodologyRecord>();
  for (const r of records) {
    const cur = latestByPeriod.get(r.period);
    if (!cur || r.frozenAt > cur.frozenAt) latestByPeriod.set(r.period, r);
  }
  const ordered = [...latestByPeriod.values()].sort(
    (a, b) => periodOrder(a.period) - periodOrder(b.period),
  );

  const entries: ChangelogEntry[] = [];
  let prev: MethodologyRecord | null = null;
  for (const rec of ordered) {
    const changes: FieldChange[] = prev ? diffRecords(prev, rec) : [];
    const status: ChangelogEntry["status"] = !prev
      ? "baseline"
      : changes.length === 0
        ? "unchanged"
        : "changed";
    entries.push({
      period: rec.period,
      previousPeriod: prev?.period ?? null,
      methodologyHash: rec.methodologyHash,
      codebookId: rec.codebookId,
      codebookVersion: rec.codebookVersion,
      ontologyVersion: rec.ontologyVersion,
      scorerVersion: rec.scorerVersion,
      frozenAt: rec.frozenAt,
      status,
      comparabilityBreak: prev ? prev.methodologyHash !== rec.methodologyHash : false,
      changes,
    });
    prev = rec;
  }
  return entries;
}

function diffRecords(prev: MethodologyRecord, cur: MethodologyRecord): FieldChange[] {
  const changes: FieldChange[] = [];
  const push = (field: FieldChange["field"], from: string | null, to: string | null): void => {
    if (from !== to) changes.push({ field, from, to });
  };
  push("codebook_version", prev.codebookVersion, cur.codebookVersion);
  push("ontology_version", prev.ontologyVersion, cur.ontologyVersion);
  push("scorer_version", prev.scorerVersion, cur.scorerVersion);
  // Content changes at the SAME version are the sneaky ones — surface them explicitly.
  if (prev.codebookSha256 !== cur.codebookSha256 && prev.codebookVersion === cur.codebookVersion) {
    push("codebook_content", short(prev.codebookSha256), short(cur.codebookSha256));
  }
  if (prev.ontologySha256 !== cur.ontologySha256 && prev.ontologyVersion === cur.ontologyVersion) {
    push("ontology_content", short(prev.ontologySha256), short(cur.ontologySha256));
  }
  push("frame", short(prev.frameSha256), short(cur.frameSha256));
  return changes;
}

const short = (h: string | null): string | null => (h ? h.slice(0, 12) : null);

export function renderChangelogJson(entries: ChangelogEntry[]): string {
  return JSON.stringify(
    { kind: "observatory-methodology-changelog", schemaVersion: 1, entries },
    null,
    2,
  );
}

const FIELD_LABEL: Record<FieldChange["field"], string> = {
  codebook_version: "Codebook version",
  ontology_version: "Ontology version",
  scorer_version: "Scorer version",
  codebook_content: "Codebook content (same version!)",
  ontology_content: "Ontology content (same version!)",
  frame: "Population frame",
};

/** Human-readable changelog, newest period first. */
export function renderChangelogMarkdown(entries: ChangelogEntry[]): string {
  const lines: string[] = [
    "# Methodology changelog",
    "",
    "> Auto-generated from `run_methodology` (WP12) + frozen frame hash (WP15). Each entry states",
    "> what changed in the scoring methodology between published periods. A **comparability break**",
    "> means the scoring identity (`methodology_hash`) changed — cross-period deltas across it are",
    "> not apples-to-apples (the dashboard suppresses them). Frame-only changes reweight headline",
    "> numbers without re-scoring and are not breaks.",
    "",
  ];
  for (const e of [...entries].reverse()) {
    lines.push(`## ${e.period}${e.comparabilityBreak ? "  ⚠️ comparability break" : ""}`);
    lines.push("");
    lines.push(
      `- methodology \`${e.methodologyHash.slice(0, 12)}\` · codebook ${e.codebookId} v${e.codebookVersion}` +
        ` · ontology v${e.ontologyVersion} · scorer ${e.scorerVersion}`,
    );
    lines.push(`- frozen ${e.frozenAt}`);
    if (e.status === "baseline") {
      lines.push("- **baseline** — first published period.");
    } else if (e.status === "unchanged") {
      lines.push(`- **unchanged** vs ${e.previousPeriod}.`);
    } else {
      lines.push(`- **changed** vs ${e.previousPeriod}:`);
      for (const c of e.changes) {
        lines.push(`  - ${FIELD_LABEL[c.field]}: \`${c.from ?? "—"}\` → \`${c.to ?? "—"}\``);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
