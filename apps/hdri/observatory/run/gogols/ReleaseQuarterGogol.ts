/*
<MODULE_CONTRACT>
<purpose>Releases the validated capsule: replicates artifacts, publishes public archive, and signs QuarterReleaseManifest.</purpose>
<non-goals>
  <item>Does not validate — use ValidateQuarterGogol.</item>
  <item>Does not seal — use SealCapsuleGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0031: new gogol for scientific release step.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";

export class ReleaseQuarterGogol extends Gogol {
  override readonly id = "release-quarter";

  override async run(ctx: PipelineContext): Promise<void> {
    const { capsuleDir } = ctx.state;
    if (!capsuleDir) throw new Error("ReleaseQuarterGogol requires capsuleDir in pipeline state");

    const releaseManifestPath = path.join(
      process.cwd(),
      "vault",
      "releases",
      `period=${ctx.state.brief.period}`,
      `${ctx.state.brief.capsuleId}.json`,
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
    const replicaConfigPath = path.join(capsuleDir, "..", "replica-config.json");
    const vaultDir = path.join(process.cwd(), "vault");
    const publicArchiveDir = path.join(process.cwd(), "public-archive");

    const { execFileSync } = await import("node:child_process");
    execFileSync(
      "pnpm",
      [
        "--filter",
        "@syrokomskyi/observatory",
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.json",
        "tools/quarter-release.ts",
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
      {
        stdio: "pipe",
        cwd: process.cwd(),
      },
    );
  }
}
