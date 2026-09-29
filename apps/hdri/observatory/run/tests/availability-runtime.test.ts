import { expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

test("standalone availability entrypoints bootstrap without project packages or native graphics/browser dependencies", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-runtime-build-"));
  try {
    const output = path.join(root, "runtime");
    const built = JSON.parse(execFileSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("tools/build-availability-runtime.ts"), "--outdir", output], { cwd: process.cwd(), encoding: "utf8" }));
    expect(built.status).toBe("built-not-qualified");
    expect(built.files).toHaveLength(4);
    for (const [file, expected] of [
      ["prepare-availability.mjs", "--capsule-dir and --keys-dir are required"],
      ["reconcile-availability.mjs", "EXPLICIT_CAPSULE_AND_KEYS_REQUIRED"],
      ["prepare-availability-preview.mjs", "EXPLICIT_CANDIDATE_RECONCILIATION_POLICY_REQUIRED"],
      ["review-availability-preview.mjs", "EXPLICIT_PREVIEW_PERIOD_POLICY_REQUIRED"],
    ]) {
      const run = spawnSync(process.execPath, [path.join(output, file!)], { cwd: root, encoding: "utf8", env: {} });
      expect(run.status).toBe(1);
      expect(run.stderr.trim()).toBe(expected);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
