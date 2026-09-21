import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import { inventorySources } from "../../tools/preservation/inventory.js";

const exec = promisify(execFile);
const cwd = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("../../tools/preservation/cli.ts", import.meta.url));
// Subprocesses get only fixture key material: never inherit the operator's signing environment.
const key = generateSigningKey();
const keyId = `fixture-${createHash("sha256").update(key.publicKeyPem).digest("hex").slice(0, 16)}`;
describe("Q2 preservation actual CLI boundary", () => {
  let root: string;
  let source: string;
  let inventoryFile: string;
  let destinationsFile: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-preservation-cli-"));
    source = path.join(root, "source");
    inventoryFile = path.join(root, "inventory.json");
    destinationsFile = path.join(root, "destinations.json");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "source.html"), "literal evidence");
    await fs.writeFile(
      inventoryFile,
      JSON.stringify({
        schema: "hdri-preservation-input@1",
        sourceRoots: [source],
        entries: await inventorySources({ roots: [source] }),
      }),
    );
    await fs.writeFile(
      destinationsFile,
      JSON.stringify(
        [0, 1, 2].map((i) => ({
          path: path.join(root, `copy-${i}`),
          failureDomain: `fixture-host-${i}`,
          medium: `fixture-medium-${i}`,
          credentialBoundary: `fixture-key-${i}`,
        })),
      ),
    );
    await fs.writeFile(path.join(root, "trusted-public.pem"), key.publicKeyPem);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  async function run(args: string[], signed = false) {
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH };
    if (signed)
      Object.assign(env, {
        DEVICE_ID: "fixture",
        DEVICE_SIGNING_KEY: Buffer.from(key.privateKeyPem).toString("base64"),
      });
    try {
      const result = await exec(
        process.execPath,
        ["--conditions=@syrokomskyi/source", "--import", "tsx", cli, ...args],
        { cwd, env, timeout: 15_000, maxBuffer: 1024 * 1024 },
      );
      return { code: 0, diagnostic: JSON.parse(result.stdout) };
    } catch (error) {
      const failed = error as Error & { code: number; stdout: string };
      return { code: failed.code, diagnostic: JSON.parse(failed.stdout) };
    }
  }
  const preserveArgs = () => [
    "preserve:q2",
    "--inventory",
    inventoryFile,
    "--destinations",
    destinationsFile,
    "--json",
  ];
  const verifyArgs = (sha: string) => [
    "preserve:verify",
    "--destinations",
    destinationsFile,
    "--manifest-sha256",
    sha,
    "--verification-key",
    path.join(root, "trusted-public.pem"),
    "--key-id",
    keyId,
    "--json",
  ];

  it("plans without private keys or output directories", async () => {
    const before = (await fs.readdir(root)).sort();
    const result = await run([...preserveArgs(), "--dry-run"]);
    expect(result.code, JSON.stringify(result.diagnostic)).toBe(0);
    expect(result.diagnostic.status).toBe("planned");
    expect((await fs.readdir(root)).sort()).toEqual(before);
  });

  it("actually consumes the supplied inventory instead of silently rescanning a different root", async () => {
    const input = JSON.parse(await fs.readFile(inventoryFile, "utf8"));
    input.entries[0].sha256 = "0".repeat(64);
    await fs.writeFile(inventoryFile, JSON.stringify(input));
    const before = (await fs.readdir(root)).sort();
    const result = await run([...preserveArgs(), "--dry-run"]);
    expect(result.code).toBe(1);
    expect(result.diagnostic.violations[0].code).toBe("CHANGED_SOURCE_BYTES");
    expect((await fs.readdir(root)).sort()).toEqual(before);
  });

  it.each([["--archive-root", "ignored"], ["unparsed-positional"], ["--destinations", "ignored"]])(
    "rejects legacy, positional or repeated arguments: %j",
    async (...extra) => {
      const before = (await fs.readdir(root)).sort();
      expect((await run([...preserveArgs(), ...extra, "--dry-run"])).code).toBe(1);
      expect((await fs.readdir(root)).sort()).toEqual(before);
    },
  );

  it("signs three actual copies and independently rejects corruption using a caller-pinned key", async () => {
    const result = await run(preserveArgs(), true);
    expect(result.code, JSON.stringify(result.diagnostic)).toBe(0);
    expect(result.diagnostic.status).toBe("pass");
    expect(result.diagnostic.evidenceRefs).toHaveLength(3);
    expect((await run(verifyArgs(result.diagnostic.inputFingerprint))).diagnostic.status).toBe(
      "pass",
    );
    await fs.writeFile(
      path.join(root, "copy-1/originals/source-0000/source.html"),
      "modified evidence",
    );
    const rejected = await run(verifyArgs(result.diagnostic.inputFingerprint));
    expect(rejected.code).toBe(1);
    expect(rejected.diagnostic.status).toBe("incomplete");
    expect(await fs.readFile(path.join(source, "source.html"), "utf8")).toBe("literal evidence");
  });

  it("blocks baseline import before creating any output or reading unverified archives", async () => {
    const before = (await fs.readdir(root)).sort();
    // The destinations point at unpopulated copy-* dirs — replica authentication must
    // fail before any work-root or target output is created.
    const result = await run([
      "baseline:import",
      "--destinations",
      destinationsFile,
      "--manifest-sha256",
      createHash("sha256").update("unverified").digest("hex"),
      "--key-id",
      keyId,
      "--verification-key",
      path.join(root, "trusted-public.pem"),
      "--source-destination",
      path.join(root, "copy-0"),
      "--work-root",
      path.join(root, "work"),
      "--scope-declaration",
      path.join(root, "scope.json"),
      "--ontology-artifact",
      "x",
      "--codebook-artifact",
      "y",
      "--import-metadata",
      path.join(root, "import.json"),
      "--target",
      path.join(root, "baseline"),
      "--period",
      "2026-q2",
      "--json",
    ]);
    expect(result.code).toBe(1);
    expect((await fs.readdir(root)).sort()).toEqual(before);
  });
});
