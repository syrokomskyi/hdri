import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-publish-gate-"));
  await fs.mkdir(path.join(root, "observatory"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("direct publication commands enforce bootstrap admission", () => {
  it("cannot certify the empty-directory digest as an independent rebuild", async () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        require.resolve("tsx/esm"),
        "--conditions=@syrokomskyi/source",
        fileURLToPath(new URL("../../tools/quarter-rebuild-verify.ts", import.meta.url)),
        "--input-manifest",
        path.join(root, "scientific-inputs.json"),
        "--report-root",
        path.join(root, "report-root"),
      ],
      { cwd: path.join(root, "observatory"), encoding: "utf8", timeout: 15000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("REBUILD_EXECUTOR_UNAVAILABLE");
    expect(await fs.readdir(root)).toEqual(["observatory"]);
  });
  it.each([
    ["export-dashboard-archive.ts", []],
    ["export-dashboard-data.ts", []],
    ["promote-to-canonical.ts", ["--apply", "--period", "2026-q3"]],
    ["quarter-release.ts", ["--release-input"]],
  ] as const)("%s cannot write with diagnostic environment bypass", async (script, initialArgs) => {
    const sentinel = path.join(
      root,
      "dashboard",
      "src",
      "assets",
      "data",
      "public",
      "retained.json",
    );
    await fs.mkdir(path.dirname(sentinel), { recursive: true });
    await fs.writeFile(sentinel, "retained quarter bytes");
    const args: string[] = [...initialArgs];
    if (script === "quarter-release.ts") {
      const manifestPath = path.join(root, "capsule-manifest.json");
      await fs.writeFile(manifestPath, JSON.stringify({ state: "sealed", period: "2026-q3" }));
      const inputPath = path.join(root, "release-input.json");
      await fs.writeFile(
        inputPath,
        JSON.stringify({
          schema: "hdri-release-input@1",
          capsuleManifestPath: manifestPath,
          vaultDir: path.join(root, "vault"),
          publicArchiveRoot: path.join(root, "public"),
          publicManifestPath: path.join(root, "public-manifest.json"),
          rebuildReceiptPath: path.join(root, "rebuild.json"),
          replicaConfigPath: path.join(root, "replicas.json"),
        }),
      );
      args.push(inputPath);
    }
    const before = (await fs.readdir(root, { recursive: true })).sort();
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        require.resolve("tsx/esm"),
        "--conditions=@syrokomskyi/source",
        fileURLToPath(new URL(`../../tools/${script}`, import.meta.url)),
        ...args,
      ],
      {
        cwd: path.join(root, "observatory"),
        encoding: "utf8",
        timeout: 15000,
        env: { ...process.env, HDRI_OPERATION: "diagnostic" },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("ProgramGate blocked");
    expect((await fs.readdir(root, { recursive: true })).sort()).toEqual(before);
    expect(await fs.readFile(sentinel, "utf8")).toBe("retained quarter bytes");
  });
});
