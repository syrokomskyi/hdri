/*
<MODULE_CONTRACT>
<purpose>Validates the sealed capsule: generates scientific QC reports, rebuild receipt, and QuarterValidationReport.</purpose>
<non-goals>
  <item>Does not seal the capsule — use SealCapsuleGogol.</item>
  <item>Does not publish or sign the release manifest — use ReleaseQuarterGogol.</item>
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
    const tsxBase = ["--tsconfig", "tsconfig.json"];
    const runTool = (tool: string, toolArgs: string[]): void => {
      execFileSync(
        "pnpm",
        ["--filter", "@syrokomskyi/observatory", "exec", "tsx", ...tsxBase, tool, ...toolArgs],
        {
          stdio: "pipe",
          cwd: process.cwd(),
        },
      );
    };

    const scientificReports = [
      "q2-restore.ts",
      "source-qc.ts",
      "classification-qc.ts",
      "methodology-compare.ts",
      "availability-report.ts",
      "privacy-review.ts",
      "methodology-snapshot.ts",
      "reconcile-counts.ts",
    ];
    for (const report of scientificReports) {
      runTool(path.join("tools", "scientific-reports", report), [
        "--period",
        ctx.state.brief.period,
        "--capsule-id",
        ctx.state.brief.capsuleId,
        "--evidence-dir",
        evidenceDir,
      ]);
    }

    runTool("tools/quarter-rebuild-verify.ts", [
      "--candidate",
      path.join(capsuleDir, "capsule-candidate.json"),
      "--scratch",
      path.join(capsuleDir, "..", "scratch-rebuild"),
      "--prepare",
    ]);
    runTool("tools/quarter-rebuild-verify.ts", [
      "--candidate",
      path.join(capsuleDir, "capsule-candidate.json"),
      "--scratch",
      path.join(capsuleDir, "..", "scratch-rebuild"),
      "--primary-public",
      path.join(capsuleDir, "artifacts", "publication"),
    ]);

    runTool("tools/quarter-validate.ts", [
      "--candidate",
      manifestPath,
      "--evidence-dir",
      evidenceDir,
    ]);
  }
}
