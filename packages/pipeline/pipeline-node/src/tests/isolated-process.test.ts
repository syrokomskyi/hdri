import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { runIsolatedProcess } from "../lib/isolated-process.js";

let root: string;
let scratch: string;
let input: string;
let secret: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-offline-process-"));
  scratch = path.join(root, "scratch");
  input = path.join(root, "input");
  secret = path.join(root, "forbidden.db");
  await fs.mkdir(scratch);
  await fs.mkdir(input);
  await fs.writeFile(secret, "private host data");
  await fs.writeFile(path.join(input, "evidence.txt"), "immutable evidence");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

async function run(script: string, limits: { timeoutMs?: number; maxOutputBytes?: number } = {}) {
  const entry = path.join(root, "worker.mjs");
  await fs.writeFile(entry, script);
  return runIsolatedProcess({
    executable: "/runtime/node",
    args: ["/runtime/worker.mjs"],
    readOnlyMounts: [
      { source: await fs.realpath(process.execPath), destination: "/runtime/node" },
      { source: entry, destination: "/runtime/worker.mjs" },
      { source: input, destination: "/input/evidence" },
    ],
    scratchRoot: scratch,
    timeoutMs: limits.timeoutMs ?? 5000,
    maxOutputBytes: limits.maxOutputBytes ?? 65_536,
    sampleIntervalMs: 20,
  });
}

describe.runIf(process.platform === "linux")(
  "offline subprocess boundary (real bubblewrap)",
  () => {
    it("reads declared evidence and writes only to scratch without inherited secrets", async () => {
      vi.stubEnv("HDRI_TEST_SIGNING_SECRET", "must-not-inherit");
      const result = await run(`
      import fs from 'node:fs';
      fs.writeFileSync('/scratch/result.txt', fs.readFileSync('/input/evidence/evidence.txt'));
      console.log(JSON.stringify({secret: process.env.HDRI_TEST_SIGNING_SECRET ?? null}));
    `);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ secret: null });
      expect(await fs.readFile(path.join(scratch, "result.txt"), "utf8")).toBe(
        "immutable evidence",
      );
    });

    it("denies direct fs, symlink, relative path, native SQLite and child-process escapes", async () => {
      await fs.symlink(secret, path.join(input, "escape.db"));
      const result = await run(`
      import fs from 'node:fs';
      import {DatabaseSync} from 'node:sqlite';
      import {execFileSync} from 'node:child_process';
      const denied = [];
      for (const [name, operation] of [
        ['direct', () => fs.readFileSync(${JSON.stringify(secret)})],
        ['symlink', () => fs.readFileSync('/input/evidence/escape.db')],
        ['relative', () => fs.readFileSync('../forbidden.db')],
        ['sqlite', () => new DatabaseSync(${JSON.stringify(secret)}, {readOnly:true})],
        ['child', () => execFileSync('/bin/cat', [${JSON.stringify(secret)}], {stdio:'pipe'})],
        ['readonly', () => fs.writeFileSync('/input/evidence/evidence.txt', 'changed')],
      ]) { try { operation(); } catch { denied.push(name); } }
      console.log(JSON.stringify(denied));
    `);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([
        "direct",
        "symlink",
        "relative",
        "sqlite",
        "child",
        "readonly",
      ]);
      expect(await fs.readFile(secret, "utf8")).toBe("private host data");
      expect(await fs.readFile(path.join(input, "evidence.txt"), "utf8")).toBe(
        "immutable evidence",
      );
    });

    it("cannot reach the host loopback service from its network namespace", async () => {
      const server = http.createServer((_request, response) =>
        response.end("forbidden host network"),
      );
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test listener port");
      try {
        const result = await run(`
        try { await fetch('http://127.0.0.1:${address.port}', {signal:AbortSignal.timeout(1000)}); console.log('escaped'); }
        catch { console.log('denied'); }
      `);
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stdout.trim()).toBe("denied");
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });

    it("measures memory allocated by a grandchild while it is alive", async () => {
      const result = await run(`
      import {spawn} from 'node:child_process';
      const child = spawn('/runtime/node', ['-e', "globalThis.held=Buffer.alloc(100*1024*1024,1);setTimeout(()=>{},700)"], {stdio:'inherit'});
      await new Promise(resolve => child.on('exit', resolve));
    `);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.peakDescendantRssBytes).toBeGreaterThan(100 * 1024 * 1024);
      expect(result.peakProcessTreeRssBytes).toBeGreaterThan(result.peakCoordinatorRssBytes);
      expect(result.samples).toBeGreaterThan(1);
    });

    it("terminates a hung worker on its absolute deadline", async () => {
      await expect(run("setInterval(()=>{},1000)", { timeoutMs: 150 })).rejects.toThrow(
        "ISOLATED_PROCESS_TIMEOUT",
      );
    });

    it("drains and bounds noisy output instead of deadlocking on an unread pipe", async () => {
      await expect(
        run("setInterval(()=>process.stdout.write('x'.repeat(10000)),1)", { maxOutputBytes: 1024 }),
      ).rejects.toThrow("ISOLATED_OUTPUT_LIMIT_EXCEEDED");
    });

    it("rejects overlapping read/write roots before executing any process", async () => {
      await expect(
        runIsolatedProcess({
          executable: "/usr/bin/true",
          args: [],
          scratchRoot: scratch,
          readOnlyMounts: [{ source: root, destination: "/input/source" }],
          timeoutMs: 1000,
          maxOutputBytes: 1024,
        }),
      ).rejects.toThrow("ISOLATION_OVERLAPPING_MOUNTS");
    });

    it("rejects broad host mounts even when requested read-only", async () => {
      await expect(
        runIsolatedProcess({
          executable: "/usr/bin/true",
          args: [],
          scratchRoot: scratch,
          readOnlyMounts: [{ source: "/", destination: "/input/host" }],
          timeoutMs: 1000,
          maxOutputBytes: 1024,
        }),
      ).rejects.toThrow("ISOLATION_INPUT_TOO_BROAD");
    });
  },
);
