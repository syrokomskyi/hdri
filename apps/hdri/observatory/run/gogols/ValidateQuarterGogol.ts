/*
<MODULE_CONTRACT>
<purpose>Validates the sealed capsule: generates 8 scientific QC reports and produces a QuarterValidationReport.</purpose>
<non-goals>
  <item>Does not seal the capsule — use SealCapsuleGogol.</item>
  <item>Does not create replicas or publish — use ReleaseQuarterGogol.</item>
  <item>Does not run rebuild verification — that is done by quarter:release after replicas exist.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0031: new gogol for scientific validation step.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";

export class ValidateQuarterGogol extends Gogol {
  override readonly id = "validate-quarter";

  override async run(ctx: PipelineContext): Promise<void> {
    const { capsuleDir } = ctx.state;
    if (!capsuleDir) throw new Error("ValidateQuarterGogol requires capsuleDir in pipeline state");

    const manifestPath = path.join(capsuleDir, "capsule-manifest.json");
    const validationPath = path.join(
      capsuleDir,
      "artifacts",
      "qc",
      "release",
      "validation-report.json",
    );

    try {
      await fs.access(validationPath);
      return;
    } catch {
      // not validated yet — proceed
    }

    const evidenceDir = path.join(capsuleDir, "artifacts", "qc", "release");
    await fs.mkdir(evidenceDir, { recursive: true });

    const { execFileSync } = await import("node:child_process");
    const toolsDir = path.join(import.meta.dirname, "..", "..", "tools");
    const runTool = (tool: string, toolArgs: string[]): void => {
      execFileSync(process.execPath, ["--import", "tsx", path.join(toolsDir, tool), ...toolArgs], {
        stdio: "pipe",
        cwd: process.cwd(),
      });
    };

    const scientificReports = [
      "scientific-reports/q2-restore.ts",
      "scientific-reports/source-qc.ts",
      "scientific-reports/classification-qc.ts",
      "scientific-reports/methodology-compare.ts",
      "scientific-reports/availability-report.ts",
      "scientific-reports/privacy-review.ts",
      "scientific-reports/methodology-snapshot.ts",
      "scientific-reports/reconcile-counts.ts",
    ];
    for (const report of scientificReports) {
      runTool(report, [
        "--period",
        ctx.state.brief.period,
        "--capsule-id",
        ctx.state.brief.capsuleId,
        "--evidence-dir",
        evidenceDir,
      ]);
    }

    runTool("quarter-validate.ts", ["--candidate", manifestPath, "--evidence-dir", evidenceDir]);
  }
}
