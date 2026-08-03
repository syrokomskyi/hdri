/*
<MODULE_CONTRACT>
<purpose>Releases the validated capsule: replicates artifacts, runs rebuild verification, publishes public archive, and signs QuarterReleaseManifest.</purpose>
<non-goals>
  <item>Does not validate scientific reports — use ValidateQuarterGogol.</item>
  <item>Does not seal — use SealCapsuleGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0031: new gogol for scientific release step.</item>
  <item>Use brief.vaultDir and outputRootDir instead of process.cwd() for vault and public archive paths.</item>
  <item>Use inputDir/replica-config.json instead of capsuleDir/../replica-config.json.</item>
  <item>Capture stderr from quarter-release.ts for diagnostics.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { outputRootDir, inputDir } from "../config";

export class ReleaseQuarterGogol extends Gogol {
  override readonly id = "release-quarter";

  override async run(ctx: PipelineContext): Promise<void> {
    const { capsuleDir, brief } = ctx.state;
    if (!capsuleDir) throw new Error("ReleaseQuarterGogol requires capsuleDir in pipeline state");

    const vaultDir = brief.vaultDir
      ? path.resolve(brief.vaultDir)
      : path.join(outputRootDir, "vault");
    const releaseManifestPath = path.join(
      vaultDir,
      "releases",
      `period=${brief.period}`,
      `${brief.capsuleId}.json`,
    );
    try {
      await fs.access(releaseManifestPath);
      return;
    } catch {
      // not released yet — proceed
    }

    const manifestPath = path.join(capsuleDir, "capsule-manifest.json");
    const validationPath = path.join(
      capsuleDir,
      "artifacts",
      "qc",
      "release",
      "validation-report.json",
    );
    const replicaConfigPath = path.join(inputDir, "replica-config.json");
    const publicArchiveDir = path.join(outputRootDir, "public-archive");

    const { execFileSync } = await import("node:child_process");
    const toolsDir = path.join(import.meta.dirname, "..", "..", "tools");
    try {
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          path.join(toolsDir, "quarter-release.ts"),
          "--capsule",
          manifestPath,
          "--validation",
          validationPath,
          "--replica-config",
          replicaConfigPath,
          "--vault-dir",
          vaultDir,
          "--public-archive-dir",
          publicArchiveDir,
        ],
        { stdio: ["pipe", "pipe", "pipe"], cwd: process.cwd() },
      );
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? "";
      throw new Error(`quarter-release failed: ${stderr || (error as Error).message}`, {
        cause: error,
      });
    }
  }
}
