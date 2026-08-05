/*
<MODULE_CONTRACT>
<purpose>Operator CLI to make the WP4 post-stratification frame production-ready (WP16, (d)).
Validates .input/population-frame.json against the strata that actually appear in the published
data — what is missing, unknown, or invalid, and whether projected coverage clears the suppression
threshold. Read-only; never invents a weight.</purpose>
<non-goals>
  <item>Does not write the frame, mutate the DB, or produce post-stratified numbers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0029: provenance-locked population-frame validation over the shared frame-core.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { inputDir, outputRootDir } from "../run/config";
import { getObservatoryDbPath } from "../run/db/connection";
import { loadPopulationFrame } from "./poststrat-core";
import { validateFrame } from "./frame-core";

const DB_DIR = path.join(outputRootDir, "db");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function findObservatoryDbs(): string[] {
  const yearArg = argValue("--year");
  if (yearArg) {
    const p = getObservatoryDbPath(Number(yearArg));
    return fs.existsSync(p) ? [p] : [];
  }
  try {
    return fs
      .readdirSync(DB_DIR)
      .filter((n) => /^observatory_\d{4}\.db$/i.test(n))
      .map((n) => path.join(DB_DIR, n))
      .sort();
  } catch {
    return [];
  }
}

/** Sampled strata universe across every published run: `${bundesland}|${destatis}` → asset count. */
function collectSampleStrata(dbPaths: string[]): Map<string, number> {
  const strata = new Map<string, number>();
  for (const dbPath of dbPaths) {
    const db = new Database(dbPath, { readonly: true });
    try {
      const runs = db
        .prepare(
          `SELECT run_id FROM pipeline_runs WHERE status = 'finished' AND publication_status = 'published'`,
        )
        .all() as Array<{ run_id: string }>;
      for (const { run_id } of runs) {
        const rows = db
          .prepare(
            `SELECT a.bundesland AS bundesland, m.target_code AS destatis, COUNT(*) AS n
               FROM scores s
               JOIN asset_states a ON a.asset_id = s.asset_id AND a.run_id = s.run_id
               LEFT JOIN asset_hwo_mappings m
                 ON m.asset_id = s.asset_id AND m.mapping_system = 'destatis_group' AND m.run_id = s.run_id
              WHERE s.run_id = ? AND s.overall_score IS NOT NULL
                AND a.bundesland IS NOT NULL AND m.target_code IS NOT NULL
              GROUP BY a.bundesland, m.target_code`,
          )
          .all(run_id) as Array<{ bundesland: string; destatis: string; n: number }>;
        for (const r of rows) {
          const key = `${r.bundesland}|${r.destatis}`;
          strata.set(key, (strata.get(key) ?? 0) + r.n);
        }
      }
    } finally {
      db.close();
    }
  }
  return strata;
}

async function main(): Promise<void> {
  const dbPaths = findObservatoryDbs();
  if (dbPaths.length === 0) {
    console.log(`No observatory_YYYY.db found in ${DB_DIR}`);
    return;
  }
  const sampleStrata = collectSampleStrata(dbPaths);
  if (sampleStrata.size === 0) {
    console.log("No published (bundesland × destatis_group) strata found — nothing to validate.");
    return;
  }

  console.log("🧮 Population-frame validation (post-stratification readiness)");
  console.log(`   sampled strata (published): ${sampleStrata.size}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const frame = await loadPopulationFrame(inputDir);
  if (!frame) {
    const framePath = path.join(inputDir, "population-frame.json");
    const exists = await fsp
      .access(framePath)
      .then(() => true)
      .catch(() => false);
    console.log(
      exists
        ? "Frame present but unusable — post-stratification is OFF."
        : "No .input/population-frame.json — post-stratification is OFF (descriptive/panel trends still ship).",
    );
    console.log(
      "Import the preserved official Destatis 53111-0011 export with frame:import.",
    );
    return;
  }

  const v = validateFrame(frame, sampleStrata);
  console.log(`   frame source: ${frame.source}`);
  console.log(
    `   positive frame strata: ${v.positiveFrameStrata}  ·  covered: ${v.coveredStrata}/${v.sampleStrata} sampled`,
  );
  console.log(
    `   projected weight coverage: ${(v.projectedWeightCoverage * 100).toFixed(1)}%  ` +
      `(threshold ${(0.95 * 100).toFixed(0)}% → ${v.meetsThreshold ? "OK" : "SUPPRESSED"})`,
  );
  console.log(
    `   minimum dimension coverage: Land ${(v.minimumBundeslandCoverage * 100).toFixed(1)}%  ·  ` +
      `group ${(v.minimumGroupCoverage * 100).toFixed(1)}%  (threshold 80%)`,
  );

  if (v.invalidWeights.length > 0) {
    console.log(`\n   ✗ ${v.invalidWeights.length} non-positive/invalid weight(s):`);
    for (const k of v.invalidWeights.slice(0, 20)) console.log(`      ${k}`);
  }
  if (v.missingInFrame.length > 0) {
    const topSample = v.missingInFrame.reduce((s, m) => s + m.sampleN, 0);
    console.log(
      `\n   ⚠ ${v.missingInFrame.length} sampled stratum/-a NOT weighted in the frame (${topSample} assets uncovered):`,
    );
    for (const m of v.missingInFrame.slice(0, 20)) console.log(`      ${m.key}  (n=${m.sampleN})`);
  }
  if (v.unknownInFrame.length > 0) {
    console.log(
      `\n   ⚠ ${v.unknownInFrame.length} frame key(s) never seen in the data (typo/dead cell):`,
    );
    for (const k of v.unknownInFrame.slice(0, 20)) console.log(`      ${k}`);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (v.ok) {
    console.log("PASS — frame is structurally usable and clears the coverage threshold.");
  } else {
    console.log(
      "FAIL — frame present but not publishable as-is (see above). Fix before enabling post-strat.",
    );
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error("[validate-frame] Failed:", error);
  process.exitCode = 1;
});
