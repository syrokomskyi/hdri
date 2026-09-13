/*
<MODULE_CONTRACT>
<purpose>Integration tests for RFC-0115 Step 5: rebuild CLI integration with prohibited-input escape matrix.</purpose>
<non-goals>
  <item>Does not test the full vault round-trip — that is covered by rebuild-roundtrip.test.ts.</item>
  <item>Does not test receipt schema validation — that is covered by hdri-independent-rebuild.test.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 Step 5: rebuild CLI integration tests and prohibited-input escape matrix.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RebuildSandbox } from "../rebuild/rebuild-sandbox";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rfc0115-rebuild-cli-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("RFC-0115 AC-4: rebuild CLI prohibited-input escape matrix", () => {
  it("denies direct access to symlink target outside allowed directory", async () => {
    const allowedDir = path.join(tmpDir, "allowed");
    const forbiddenDir = path.join(tmpDir, "forbidden");
    await fs.mkdir(allowedDir, { recursive: true });
    await fs.mkdir(forbiddenDir, { recursive: true });
    await fs.writeFile(path.join(forbiddenDir, "secret.json"), "private data");

    // Create a symlink inside allowedDir pointing to forbiddenDir
    const symlinkPath = path.join(allowedDir, "escape-link");
    await fs.symlink(forbiddenDir, symlinkPath);

    const sandbox = new RebuildSandbox([allowedDir]);
    const sandboxedFs = sandbox.getFs();

    // Direct access to the forbidden path must be denied
    let denied = false;
    try {
      await sandboxedFs.readFile(path.join(forbiddenDir, "secret.json"), "utf8");
    } catch (err) {
      denied = (err as Error).name === "IsolationBoundaryViolation";
    }
    expect(denied, "Direct access to symlink target must be denied").toBe(true);

    // Access log should not contain the forbidden path
    const log = sandbox.getAccessLog();
    expect(log.some((p) => p.includes("forbidden"))).toBe(false);
  });

  it("denies relative path traversal from allowed directory", async () => {
    const allowedDir = path.join(tmpDir, "allowed");
    const forbiddenDir = path.join(tmpDir, "forbidden");
    await fs.mkdir(allowedDir, { recursive: true });
    await fs.mkdir(forbiddenDir, { recursive: true });
    await fs.writeFile(path.join(forbiddenDir, "secret.json"), "private data");

    const sandbox = new RebuildSandbox([allowedDir]);
    const sandboxedFs = sandbox.getFs();

    let denied = false;
    try {
      // Try relative path traversal: allowedDir/../forbidden/secret.json
      const escapePath = path.join(allowedDir, "..", "forbidden", "secret.json");
      await sandboxedFs.readFile(escapePath, "utf8");
    } catch (err) {
      denied = (err as Error).name === "IsolationBoundaryViolation";
    }
    expect(denied, "Relative path traversal must be denied").toBe(true);
  });

  it("denies absolute path access outside allowed roots", async () => {
    const allowedDir = path.join(tmpDir, "allowed");
    const forbiddenFile = path.join(tmpDir, "secret.json");
    await fs.mkdir(allowedDir, { recursive: true });
    await fs.writeFile(forbiddenFile, "private data");

    const sandbox = new RebuildSandbox([allowedDir]);
    const sandboxedFs = sandbox.getFs();

    let denied = false;
    try {
      await sandboxedFs.readFile(forbiddenFile, "utf8");
    } catch (err) {
      denied = (err as Error).name === "IsolationBoundaryViolation";
    }
    expect(denied, "Absolute path outside allowed roots must be denied").toBe(true);
  });

  it("allows access within declared allowed roots", async () => {
    const allowedDir = path.join(tmpDir, "allowed");
    await fs.mkdir(allowedDir, { recursive: true });
    await fs.writeFile(path.join(allowedDir, "data.json"), '{"test":true}');

    const sandbox = new RebuildSandbox([allowedDir]);
    const sandboxedFs = sandbox.getFs();

    const content = await sandboxedFs.readFile(path.join(allowedDir, "data.json"), "utf8");
    expect(content).toBe('{"test":true}');

    const log = sandbox.getAccessLog();
    expect(log.some((p) => p.includes("data.json"))).toBe(true);
  });

  it("isolation proof hash is deterministic for same access pattern", async () => {
    const allowedDir = path.join(tmpDir, "allowed");
    await fs.mkdir(allowedDir, { recursive: true });
    await fs.writeFile(path.join(allowedDir, "a.json"), "a");
    await fs.writeFile(path.join(allowedDir, "b.json"), "b");

    const sandbox1 = new RebuildSandbox([allowedDir]);
    const sf1 = sandbox1.getFs();
    await sf1.readFile(path.join(allowedDir, "a.json"), "utf8");
    await sf1.readFile(path.join(allowedDir, "b.json"), "utf8");
    const proof1 = sandbox1.computeIsolationProof();

    const sandbox2 = new RebuildSandbox([allowedDir]);
    const sf2 = sandbox2.getFs();
    await sf2.readFile(path.join(allowedDir, "a.json"), "utf8");
    await sf2.readFile(path.join(allowedDir, "b.json"), "utf8");
    const proof2 = sandbox2.computeIsolationProof();

    expect(proof1).toBe(proof2);
    expect(proof1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("denies access to working DB path outside allowed roots", async () => {
    const allowedDir = path.join(tmpDir, "vault");
    const workingDbPath = path.join(tmpDir, "observatory_2026.db");
    await fs.mkdir(allowedDir, { recursive: true });
    await fs.writeFile(workingDbPath, "fake db bytes");

    const sandbox = new RebuildSandbox([allowedDir]);
    const sandboxedFs = sandbox.getFs();

    let denied = false;
    try {
      await sandboxedFs.readFile(workingDbPath, "utf8");
    } catch (err) {
      denied = (err as Error).name === "IsolationBoundaryViolation";
    }
    expect(denied, "Working DB access must be denied").toBe(true);
  });

  it("denies access to expected public bytes outside allowed roots", async () => {
    const allowedDir = path.join(tmpDir, "vault");
    const publicDir = path.join(tmpDir, "public");
    await fs.mkdir(allowedDir, { recursive: true });
    await fs.mkdir(publicDir, { recursive: true });
    await fs.writeFile(path.join(publicDir, "manifest.json"), '{"expected":true}');

    const sandbox = new RebuildSandbox([allowedDir]);
    const sandboxedFs = sandbox.getFs();

    let denied = false;
    try {
      await sandboxedFs.readFile(path.join(publicDir, "manifest.json"), "utf8");
    } catch (err) {
      denied = (err as Error).name === "IsolationBoundaryViolation";
    }
    expect(denied, "Expected public bytes access must be denied").toBe(true);
  });
});
