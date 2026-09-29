/*
<MODULE_CONTRACT>
<purpose>ValidateQuarterGogol selects applicable scientific QC reports from retained publication scope and invokes reconstruction and quarter validation without trusting report-file presence.</purpose>
<non-goals>
  <item>Does not seal the capsule — use SealCapsuleGogol.</item>
  <item>Does not create replicas or publish — use ReleaseQuarterGogol.</item>
  <item>Does not check replica evidence — that is validated by quarter-release.ts after replicas exist.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0031: new gogol for scientific validation step.</item>
  <item>Pass domain-specific args to each scientific report tool (source-ledger, products-dir, codebook, etc.).</item>
  <item>Run methodology-snapshot before methodology-compare so Q3 snapshot is available.</item>
  <item>Run quarter-rebuild-verify (prepare + copy publication artifacts + verify) before writing validation report.</item>
  <item>Capture stderr from tool invocations for diagnostics instead of swallowing with stdio: pipe.</item>
  <item>RFC-0109: use --release-input contract. Invoke quarter-validate.ts instead of calling validateReleaseEvidence directly. No mutable overwrite of preliminary reports — immutable revisions via shared.ts.</item>
  <item>RFC-0115: select reports from byte-bound intent and the optional Q3 classification decision; reject failed required producer verdicts.</item>
  <item>RFC-0115: pass actual capsule/key inputs to availability/source QC and the retained public manifest to privacy review.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { getTransparencyKeysDir } from "@syrokomskyi/observatory-crypto";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { outputRootDir } from "../config";
import { requiredRetainedScientificReports } from "../release/release-contract";
import { readRetainedPublicationScope } from "../release/publication-scope";

export class ValidateQuarterGogol extends Gogol {
  override readonly id = "validate-quarter";

  override async run(ctx: PipelineContext): Promise<void> {
    const { capsuleDir, brief } = ctx.state;
    if (!capsuleDir) throw new Error("ValidateQuarterGogol requires capsuleDir in pipeline state");

    const evidenceDir = path.join(capsuleDir, "artifacts", "qc", "release");
    await fs.mkdir(evidenceDir, { recursive: true });

    const { execFileSync } = await import("node:child_process");
    const toolsDir = path.join(import.meta.dirname, "..", "..", "tools");
    const appDir = path.resolve(import.meta.dirname, "..", "..");
    const policiesDir = path.join(appDir, "policies");
    const candidate = JSON.parse(await fs.readFile(
      ctx.state.candidateManifestPath ?? path.join(capsuleDir, "capsule-candidate.json"), "utf8")) as QuarterCapsule;
    const reports = await requiredRetainedScientificReports(capsuleDir, candidate, await readRetainedPublicationScope(capsuleDir, candidate));
    const producers = new Set(reports.map(([, entry]) => entry.producer as string));

    const runTool = (tool: string, toolArgs: string[]): void => {
      if (tool.startsWith("scientific-reports/") && !producers.has(tool)) return;
      try {
        const stdout = execFileSync(
          process.execPath,
          ["--import", "tsx", "--conditions=@syrokomskyi/source", path.join(toolsDir, tool), ...toolArgs],
          {
            stdio: ["pipe", "pipe", "pipe"],
            cwd: process.cwd(),
          },
        );
        if (tool.startsWith("scientific-reports/") && JSON.parse(stdout.toString("utf8")).status !== "pass")
          throw new Error(`Scientific report ${tool} rejected the candidate`);
      } catch (error) {
        const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? "";
        throw new Error(`Tool ${tool} failed: ${stderr || (error as Error).message}`, {
          cause: error,
        });
      }
    };

    const { year, quarter } = parsePeriod(brief.period);
    const priorYear = quarter === 1 ? year - 1 : year;
    const priorQuarter = quarter === 1 ? 4 : quarter - 1;
    const priorPeriod = `${priorYear}-q${priorQuarter}`;

    const vaultDir = brief.vaultDir
      ? path.resolve(brief.vaultDir)
      : path.join(outputRootDir, "vault");
    const publicArchiveRoot = path.join(outputRootDir, "public-archive");

    const commonArgs = [
      "--period",
      brief.period,
      "--capsule-id",
      brief.capsuleId,
      "--evidence-dir",
      evidenceDir,
    ];

    // 1. methodology-snapshot first — methodology-compare reads its output
    runTool("scientific-reports/methodology-snapshot.ts", [
      ...commonArgs,
      "--codebook",
      path.join(capsuleDir, "artifacts", "methodology", "codebook.yaml"),
      "--ontology",
      path.join(capsuleDir, "artifacts", "methodology", "ontology.yaml"),
      "--policies-dir",
      policiesDir,
    ]);

    // 2. methodology-compare uses Q3 snapshot from step 1
    runTool("scientific-reports/methodology-compare.ts", [
      ...commonArgs,
      "--q2-snapshot",
      path.join(vaultDir, "releases", `period=${priorPeriod}`, "methodology-snapshot.json"),
      "--q3-snapshot",
      path.join(evidenceDir, "methodology-snapshot.json"),
    ]);

    // 3. Remaining 6 scientific reports
    runTool("scientific-reports/q2-restore.ts", [
      ...commonArgs,
      "--q2-archive-dir",
      path.join(publicArchiveRoot, priorPeriod),
    ]);

    runTool("scientific-reports/source-qc.ts", [
      ...commonArgs,
      "--capsule-dir", capsuleDir,
      "--keys-dir", getTransparencyKeysDir(),
    ]);

    runTool("scientific-reports/classification-qc.ts", [
      ...commonArgs,
      "--predictions",
      path.join(capsuleDir, "artifacts", "qc", "classification-predictions.json"),
      "--sample",
      path.join(capsuleDir, "artifacts", "qc", "classification-sample.json"),
    ]);

    runTool("scientific-reports/availability-report.ts", [
      ...commonArgs,
      "--capsule-dir", capsuleDir,
      "--keys-dir", getTransparencyKeysDir(),
      "--policy", path.join(policiesDir, "k-anon-policy-v1.yaml"),
    ]);

    runTool("scientific-reports/privacy-review.ts", [
      ...commonArgs,
      "--public-manifest",
      path.join(capsuleDir, "artifacts", "publication", "public-manifest.json"),
      "--policy",
      path.join(policiesDir, "k-anon-policy-v1.yaml"),
    ]);

    runTool("scientific-reports/reconcile-counts.ts", [
      ...commonArgs,
      "--source-ledger",
      path.join(capsuleDir, "artifacts", "source-ledger", "ledger-manifest.json"),
      "--observations",
      path.join(capsuleDir, "artifacts", "emit", "emit-manifest.json"),
      "--scores",
      path.join(capsuleDir, "artifacts", "qc", "score-report.json"),
    ]);

    // 4. Invoke quarter-rebuild-verify with --input-manifest and --report-root
    const inputManifestPath =
      ctx.state.scientificInputPath ?? path.join(capsuleDir, "scientific-inputs.json");
    const reportRoot = path.join(capsuleDir, "artifacts", "qc", "release");
    runTool("quarter-rebuild-verify.ts", [
      "--input-manifest",
      inputManifestPath,
      "--report-root",
      reportRoot,
    ]);

    // 4b. Verify all registry-declared scientific reports exist
    for (const [filename] of reports) {
      try {
        await fs.access(path.join(evidenceDir, filename));
      } catch {
        throw new Error(`Missing scientific report from registry: ${filename}`);
      }
    }

    // 5. Invoke quarter-validate.ts with --release-input
    const releaseInputPath =
      ctx.state.releaseInputPath ?? path.join(capsuleDir, "release-input.json");
    try {
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--conditions=@syrokomskyi/source",
          path.join(toolsDir, "quarter-validate.ts"),
          "--release-input",
          releaseInputPath,
        ],
        { stdio: ["pipe", "pipe", "pipe"], cwd: process.cwd() },
      );
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? "";
      throw new Error(`quarter-validate failed: ${stderr || (error as Error).message}`, {
        cause: error,
      });
    }
  }
}
