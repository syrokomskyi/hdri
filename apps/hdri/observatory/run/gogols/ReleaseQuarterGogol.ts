/*
<MODULE_CONTRACT>
<purpose>Releases the validated capsule: invokes quarter-release.ts with --release-input to replicate artifacts, create PublicationAttestation, and atomically publish the public archive.</purpose>
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
  <item>RFC-0109: use --release-input contract instead of --capsule/--validation/--replica-config/--vault-dir/--public-archive-dir. Tolerate interrupted copy by resuming missing objects.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { outputRootDir } from "../config";

export class ReleaseQuarterGogol extends Gogol {
  override readonly id = "release-quarter";

  override async run(ctx: PipelineContext): Promise<void> {
    const { capsuleDir, brief } = ctx.state;
    if (!capsuleDir) throw new Error("ReleaseQuarterGogol requires capsuleDir in pipeline state");

    const vaultDir = brief.vaultDir
      ? path.resolve(brief.vaultDir)
      : path.join(outputRootDir, "vault");
    const releaseEnvelopePath = path.join(
      vaultDir,
      "releases",
      `period=${brief.period}`,
      `${brief.capsuleId}.json`,
    );
    try {
      await fs.access(releaseEnvelopePath);
      return;
    } catch {
      // not released yet — proceed
    }

    const releaseInputPath =
      ctx.state.releaseInputPath ?? path.join(capsuleDir, "release-input.json");

    const { execFileSync } = await import("node:child_process");
    const toolsDir = path.join(import.meta.dirname, "..", "..", "tools");
    try {
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          path.join(toolsDir, "quarter-release.ts"),
          "--release-input",
          releaseInputPath,
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
