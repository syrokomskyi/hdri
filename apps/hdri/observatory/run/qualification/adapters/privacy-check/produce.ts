/*
<MODULE_CONTRACT>
  <purpose>Production adapter: enforce the k-anonymity gate over scored cohorts before any aggregate may leave the stage.</purpose>
  <non-goals><item>Does not publish — produces a gate verdict plus suppressed/release cell lists.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: privacy-check producer via KAnonymityGateStep.enforceKAnonymity.</item>
</CHANGE_SUMMARY>
*/
import path from "node:path";
import Database from "better-sqlite3";
import type { PipelineStepContext } from "@warpgogol/pipeline-core";
import {
  KAnonymityGateStep,
  type KAnonymityOutcome,
  type Stratum,
} from "@warpgogol/pipeline-steps";
import {
  ackFault,
  appendJsonl,
  loadFixtureManifest,
  parseAdapterArgs,
  scratchPath,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const stageDir = path.join(args.workRoot, args.stage);

const scoresDb = new Database(scratchPath(args.workRoot, "work/scoring/observations.sqlite"), {
  readonly: true,
});
const scores = scoresDb
  .prepare("SELECT asset_id, overall_score FROM scores WHERE run_id = ? ORDER BY asset_id")
  .all(manifest.runId) as { asset_id: string; overall_score: number }[];
scoresDb.close();

// Stratify by score decile — the same aggregation unit the quarterly release uses.
const strata = new Map<string, Stratum>();
for (const s of scores) {
  const key = `d${Math.min(9, Math.floor(s.overall_score * 10))}`;
  const stratum = strata.get(key) ?? { dimension: "score_decile", key, count: 0 };
  stratum.count++;
  strata.set(key, stratum);
}

// Minimal subclass: strata and output dir are injected; the gating logic is the
// production enforceKAnonymity path unchanged.
class RehearsalKGate extends KAnonymityGateStep {
  readonly id = "privacy-check";
  constructor(
    private readonly strataInput: Stratum[],
    private readonly outDir: string,
  ) {
    super();
  }
  protected override collectStrata(): Stratum[] {
    return this.strataInput;
  }
  protected override getOutputDir(): string {
    return this.outDir;
  }
  override async run(): Promise<void> {}
  async enforce(): Promise<KAnonymityOutcome> {
    // The overridden methods never touch ctx — a stub satisfies the signature.
    return this.enforceKAnonymity({} as PipelineStepContext);
  }
}

const outcome = await new RehearsalKGate([...strata.values()], stageDir).enforce();

// Gate report sealed — the final-publication boundary is the deterministic failpoint.
if (args.faultBoundary === "final-publication")
  await ackFault(args, "final-publication", {
    strata: outcome.report.total_strata,
    suppressed: outcome.report.suppressed_strata,
    passed: outcome.passed,
  });

const projection = path.join(stageDir, "projection.jsonl");
for (const s of outcome.report.strata)
  await appendJsonl(projection, {
    dimension: s.dimension,
    key: s.key,
    count: s.count,
    suppressed: s.suppressed,
  });

await writeJsonAtomic(path.join(stageDir, "privacy-receipt.json"), {
  schema: "hdri-privacy-check@1",
  stage: args.stage,
  kMin: outcome.report.k_min,
  totalStrata: outcome.report.total_strata,
  suppressedStrata: outcome.report.suppressed_strata,
  passed: outcome.passed,
  checkedAt: manifest.frozenTime,
});
