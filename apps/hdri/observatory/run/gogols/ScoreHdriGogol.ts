/*
<MODULE_CONTRACT>
<purpose>Reads observations, builds SiteSignals per asset, scores via HDRI codebook, writes results.</purpose>
<non-goals>
  <item>Do not aggregate scores — that is done by build-cohorts.</item>
  <item>Do not modify observations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for observatory.</item>
  <item>P0.4: use factory_run_id instead of run_id for matching synced bundles.</item>
  <item>Replace raw console.log/console.warn with structured NDJSON logger from @syrokomskyi/pipeline-core.</item>
  <item>Add single-line progress reporting while scoring large asset batches.</item>
  <item>WP2: clear prior scores/dimensions/traces for the run before inserting (idempotent rebuild, no duplicate accumulation on re-runs).</item>
  <item>WP7: delegate read+build+score+write to the shared score-core so rebuild-from-vault re-scores through the identical path (same overall_score + computation_hash).</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { parseCodebookOrThrow } from "@syrokomskyi/hdri-codebook";
import type { Codebook } from "@syrokomskyi/hdri-codebook";
import { parseOntology, parsePeriod, sha256 } from "@syrokomskyi/observatory-core";
import type { SignalOntology } from "@syrokomskyi/observatory-core";
import { createJsonLogger } from "@syrokomskyi/pipeline-core";
import { logProgress } from "@syrokomskyi/utils";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { openObservatoryDb } from "../db/connection";
import { inputDir } from "../config";
import { scoreAndWriteForRun, type ScoringSummary } from "../score/score-core";
import { computeMethodologyFingerprint, writeRunMethodology } from "../score/methodology-core";

export class ScoreHdriGogol extends Gogol {
  override readonly id = "score-hdri";

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error("Missing run_id — setup-observatory-run must run first");
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const runId = ctx.state.runId!;
    const now = new Date().toISOString();
    const log = createJsonLogger({
      app: "observatory",
      pipeline: "observatory",
    }).withContext({ gogol: this.id });

    // Load codebook (retain the raw source so its content can be frozen — WP12).
    const { codebook, source: codebookSource } = await loadCodebook();
    log.info(
      "codebook-loaded",
      `Codebook: ${codebook.id} v${codebook.version}, ${codebook.dimensions.length} dimensions`,
      {
        codebookId: codebook.id,
        codebookVersion: codebook.version,
        dimensions: codebook.dimensions.length,
      },
    );

    // Load ontology and cross-validate every codebook inputKey against it.
    // Fail-fast on rename/typo before scoring; warn on deprecated signals.
    const loadedOntology = await loadOntologyForCodebook(codebook, log);
    const ontology = loadedOntology?.ontology ?? null;
    const ontologySource = loadedOntology?.source ?? null;
    if (ontology) {
      crossValidateCodebookAgainstOntology(codebook, ontology, log);
    }

    const year = parsePeriod(ctx.state.brief.period).year;

    // Score the run through the shared scoring core. The same code path is used by
    // rebuild-from-vault (WP7), so a DB rebuilt from the vault re-scores identically
    // (same overall_score and computation_hash per asset).
    const db = openObservatoryDb(year);
    let summary: ScoringSummary;

    let methodology: ReturnType<typeof computeMethodologyFingerprint>;
    try {
      summary = scoreAndWriteForRun(db, codebook, {
        runId,
        period: ctx.state.brief.period,
        now,
        onProgress: (processed, total) => logProgress(this.id, processed, total, 1000, true),
      });

      // Freeze the exact methodology that produced these scores (WP12): codebook +
      // ontology + scorer version and their content hashes, immutable once written.
      methodology = computeMethodologyFingerprint({
        codebookId: codebook.id,
        codebookVersion: codebook.version,
        ontologyVersion: ontology?.version ?? ctx.state.brief.ontologyVersion,
        scorerVersion: readScorerVersion(),
        codebookSource,
        ontologySource,
      });
      // WP15: also record the population-frame content hash when a frame is present, so the
      // frozen per-period methodology snapshot (codebook + ontology + frame) is complete.
      const frameSha256 = await readFrameSha256();
      writeRunMethodology(db, runId, methodology, now, frameSha256);
    } finally {
      db.close();
    }

    log.info(
      "methodology-frozen",
      `Froze methodology ${methodology.methodologyHash.slice(0, 12)} ` +
        `(codebook ${methodology.codebookVersion}, ontology ${methodology.ontologyVersion}, scorer ${methodology.scorerVersion})`,
      { methodology },
    );

    const { scored, skipped, total } = summary;
    ctx.state.scoreCount = scored;
    log.info("scoring-assets", `Scored ${total} assets`, { assetCount: total });

    const outDir = ctx.getGogolOutputDir(this.id);
    await ctx.writeTextFile(
      path.join(outDir, "score-summary.json"),
      JSON.stringify(
        {
          scored,
          skipped,
          total,
          codebook_id: codebook.id,
          codebook_version: codebook.version,
          run_id: runId,
          methodology_hash: methodology.methodologyHash,
        },
        null,
        2,
      ),
    );

    // Human-readable frozen-methodology artifact (mirrors the run_methodology row).
    await ctx.writeTextFile(
      path.join(outDir, "methodology.json"),
      JSON.stringify({ run_id: runId, frozen_at: now, ...methodology }, null, 2),
    );

    log.info("scoring-finished", `Done. ${scored} scored, ${skipped} skipped (null overall).`, {
      scored,
      skipped,
    });
  }
}

async function loadCodebook(): Promise<{ codebook: Codebook; source: string }> {
  const codebookPath = path.join(inputDir, "codebook.yaml");
  const source = await fs.readFile(codebookPath, "utf-8");
  return { codebook: parseCodebookOrThrow(source, codebookPath), source };
}

/**
 * Loads the ontology referenced by the codebook (codebook.ontologyRef → resolved
 * relative to .input/), returning both the parsed ontology and its raw source (the
 * source is frozen into the methodology fingerprint — WP12). Returns null if no
 * ontologyRef is declared (legacy mode).
 */
async function loadOntologyForCodebook(
  codebook: Codebook,
  log: import("@syrokomskyi/pipeline-core").JsonLogger,
): Promise<{ ontology: SignalOntology; source: string } | null> {
  if (!codebook.ontologyRef) return null;
  const ontologyPath = path.isAbsolute(codebook.ontologyRef)
    ? codebook.ontologyRef
    : path.join(inputDir, codebook.ontologyRef);
  try {
    const source = await fs.readFile(ontologyPath, "utf-8");
    const ontology = parseOntology(source, path.basename(ontologyPath));
    log.info(
      "ontology-loaded",
      `Ontology: v${ontology.version}, ${Object.keys(ontology.signals).length} signals`,
      {
        ontologyVersion: ontology.version,
        signalCount: Object.keys(ontology.signals).length,
      },
    );
    return { ontology, source };
  } catch (err) {
    throw new Error(
      `[score-hdri] Failed to load ontologyRef="${codebook.ontologyRef}" — ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/**
 * SHA-256 of the population-frame source at .input/population-frame.json, or null when no frame
 * file is present. Hashes the raw bytes verbatim (same convention as codebook/ontology) so it
 * matches what the frozen methodology snapshot stores (WP15).
 */
async function readFrameSha256(): Promise<string | null> {
  try {
    const source = await fs.readFile(path.join(inputDir, "population-frame.json"), "utf-8");
    return sha256(source);
  } catch {
    return null;
  }
}

/** Reads the scoring-engine (@syrokomskyi/hdri-codebook) package version; "unknown" if unresolvable. */
function readScorerVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("@syrokomskyi/hdri-codebook/package.json") as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Cross-validates that every codebook inputKey exists in the ontology.
 * Throws on unknown signals; warns on deprecated ones.
 */
function crossValidateCodebookAgainstOntology(
  codebook: Codebook,
  ontology: SignalOntology,
  log: import("@syrokomskyi/pipeline-core").JsonLogger,
): void {
  const unknown: string[] = [];
  const deprecated: string[] = [];

  for (const dim of codebook.dimensions) {
    for (const ind of dim.indicators) {
      const def = ontology.signals[ind.inputKey];
      if (!def) {
        unknown.push(`${dim.id}/${ind.id} → "${ind.inputKey}"`);
        continue;
      }
      if (def.deprecated_in != null) {
        deprecated.push(
          `${dim.id}/${ind.id} → "${ind.inputKey}" (deprecated_in v${def.deprecated_in})`,
        );
      }
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `[score-hdri] Codebook references signals not in ontology v${ontology.version}:\n  ` +
        unknown.join("\n  "),
    );
  }

  if (deprecated.length > 0) {
    log.warn(
      "deprecated-signals",
      `codebook references ${deprecated.length} deprecated signal(s)`,
      {
        deprecatedCount: deprecated.length,
        deprecatedSignals: deprecated,
      },
    );
  }
}
