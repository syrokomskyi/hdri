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
});
