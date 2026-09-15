import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("../config.js", () => ({
  get inputDir() {
    return state.tmpDir;
  },
}));

vi.mock("../paths.js", () => ({
  getBatchInputDir: (sourceToken: string) => path.join(state.tmpDir, "batches", sourceToken),
}));

describe("bootstrap-batches first-quarter behavior", () => {
  let priorCapsulesPath: string;

  beforeAll(async () => {
    state.tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-batches-test-"));
    priorCapsulesPath = path.join(state.tmpDir, "prior-capsules.json");
    const batchesDir = path.join(state.tmpDir, "batches", "2026-q2-de-05");
    await fs.mkdir(batchesDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.unlink(priorCapsulesPath);
    } catch {
      // ignore
    }
  });

  it("throws when prior-capsules.json is missing and isFirstQuarter is false", async () => {
    const { discoverLedger } = await import("../app/input/bootstrap-batches.js");
    await expect(discoverLedger("2026-q2-de-05", false)).rejects.toThrow(
      /prior-capsules\.json not found/,
    );
  });

  it("passes when prior-capsules.json is missing and isFirstQuarter is true", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { discoverLedger } = await import("../app/input/bootstrap-batches.js");
    const result = await discoverLedger("2026-q2-de-05", true);
    expect(result.currentBatchIds).toContain("2026-q2-de-05");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("first-quarter mode"));
    warnSpy.mockRestore();
  });

  it("does not treat a missing referenced archive as first-quarter input", async () => {
    await fs.writeFile(
      priorCapsulesPath,
      JSON.stringify({
        schemaVersion: "1",
        currentPeriod: "2026-q2",
        priorCapsules: [
          {
            period: "2026-q1",
            capsuleId: "0198f000-0000-7000-8000-000000000000",
            manifestPath: "missing/capsule-manifest.json",
            sourceLedgerHead: "head",
            frameId: "frame-2026-q1.json",
            batchIds: [],
          },
        ],
      }),
    );
    const { discoverLedger } = await import("../app/input/bootstrap-batches.js");
    await expect(discoverLedger("2026-q2-de-05", true)).rejects.toThrow(
      /Prior capsule verification failed: ENOENT/,
    );
  });

  it("rejects a wrong-quarter empty index even with first-quarter mode", async () => {
    await fs.writeFile(
      priorCapsulesPath,
      JSON.stringify({ schemaVersion: "1", currentPeriod: "2026-q3", priorCapsules: [] }),
    );
    const { discoverLedger } = await import("../app/input/bootstrap-batches.js");
    await expect(discoverLedger("2026-q2-de-05", true)).rejects.toThrow(/requested operation/);
  });

  it("does not silently restart an ongoing quarterly series from an empty index", async () => {
    await fs.writeFile(
      priorCapsulesPath,
      JSON.stringify({ schemaVersion: "1", currentPeriod: "2026-q2", priorCapsules: [] }),
    );
    const { discoverLedger } = await import("../app/input/bootstrap-batches.js");
    await expect(discoverLedger("2026-q2-de-05", false)).rejects.toThrow(
      /requires explicit first-quarter/,
    );
  });
});
