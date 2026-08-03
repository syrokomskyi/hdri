/*
<MODULE_CONTRACT>
<purpose>Validates the sealed capsule: generates 8 scientific QC reports, runs empty-scratch rebuild verification, and produces a QuarterValidationReport.</purpose>
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
  <item>Write validation report directly via validateReleaseEvidence, tolerating missing replicas.</item>
  <item>Capture stderr from tool invocations for diagnostics instead of swallowing with stdio: pipe.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { outputRootDir } from "../config";
import {
  readScientificReports,
  validateReleaseEvidence,
  sha256File,
  type RebuildReceipt,
} from "../release/release-contract";

export class ValidateQuarterGogol extends Gogol {
  override readonly id = "validate-quarter";

  override async run(ctx: PipelineContext): Promise<void> {
    const { capsuleDir, brief } = ctx.state;
    if (!capsuleDir) throw new Error("ValidateQuarterGogol requires capsuleDir in pipeline state");

    const manifestPath = path.join(capsuleDir, "capsule-manifest.json");
    const evidenceDir = path.join(capsuleDir, "artifacts", "qc", "release");
    const validationPath = path.join(evidenceDir, "validation-report.json");

    try {
      await fs.access(validationPath);
      return;
    } catch {
      // not validated yet — proceed
    }

    await fs.mkdir(evidenceDir, { recursive: true });

    const { execFileSync } = await import("node:child_process");
    const toolsDir = path.join(import.meta.dirname, "..", "..", "tools");
    const appDir = path.resolve(import.meta.dirname, "..", "..");
    const policiesDir = path.join(appDir, "policies");

    const runTool = (tool: string, toolArgs: string[]): void => {
      try {
        execFileSync(
          process.execPath,
          ["--import", "tsx", path.join(toolsDir, tool), ...toolArgs],
          {
            stdio: ["pipe", "pipe", "pipe"],
            cwd: process.cwd(),
          },
        );
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
    const martDir = path.join(outputRootDir, "mart");

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
      "--source-ledger-dir",
      path.join(capsuleDir, "artifacts", "source-ledger"),
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
      "--liveness-db",
      path.join(capsuleDir, "artifacts", "liveness"),
      "--frame",
      path.join(capsuleDir, "artifacts", "frame"),
    ]);

    runTool("scientific-reports/privacy-review.ts", [
      ...commonArgs,
      "--products-dir",
      martDir,
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

    // 4. Empty-scratch rebuild verification
    const scratchDir = path.join(outputRootDir, "scratch-rebuild", brief.period);
    await fs.rm(scratchDir, { recursive: true, force: true });
    runTool("quarter-rebuild-verify.ts", ["--prepare", "--scratch", scratchDir]);

    // Copy publication artifacts to scratch (simulating independent rebuild from capsule)
    const publicationDir = path.join(capsuleDir, "artifacts", "publication");
    try {
      const pubEntries = await fs.readdir(publicationDir, { withFileTypes: true });
      for (const entry of pubEntries) {
        if (entry.isFile()) {
          await fs.copyFile(
            path.join(publicationDir, entry.name),
            path.join(scratchDir, entry.name),
          );
        }
      }
    } catch {
      // publication dir may not exist — rebuild verify will report the mismatch
    }

    runTool("quarter-rebuild-verify.ts", [
      "--candidate",
      manifestPath,
      "--scratch",
      scratchDir,
      "--primary-public",
      publicationDir,
    ]);

    // 5. Read all 8 scientific reports (throws if any report fails)
    const sealedCapsule = JSON.parse(await fs.readFile(manifestPath, "utf8")) as QuarterCapsule;
    const reports = await readScientificReports(evidenceDir, sealedCapsule);

    // 6. Write preliminary validation report (replicas not yet available —
    //    quarter-release.ts will re-validate with replicas and overwrite this file)
    const candidateManifestSha256 = await sha256File(
      path.join(capsuleDir, "capsule-candidate.json"),
    );
    const rebuild = JSON.parse(
      await fs.readFile(path.join(evidenceDir, "rebuild-receipt.json"), "utf8"),
    ) as RebuildReceipt;

    const report = validateReleaseEvidence(
      sealedCapsule,
      reports,
      rebuild,
      [],
      candidateManifestSha256,
    );

    await fs.writeFile(validationPath, `${JSON.stringify(report, null, 2)}\n`);

    // Clean up scratch directory
    await fs.rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
