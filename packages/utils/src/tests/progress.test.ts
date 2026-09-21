import { describe, it, expect, afterEach } from "vitest";
import { logProgress } from "../progress.js";

describe("logProgress", () => {
  const originalWrite = process.stdout.write.bind(process.stdout);

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  function captureOutput(): string[] {
    const lines: string[] = [];
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as typeof process.stdout.write;
    return lines;
  }

  it("does not log when current is 0", () => {
    const lines = captureOutput();
    logProgress("gogol-x", 0, 100, 10);
    expect(lines).toHaveLength(0);
  });

  it("logs at interval boundaries", () => {
    const lines = captureOutput();
    logProgress("gogol-x", 10, 100, 10);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[gogol-x]");
    expect(lines[0]).toContain("10/100");
    expect(lines[0]).toContain("10%");
  });

  it("does not log between intervals", () => {
    const lines = captureOutput();
    logProgress("gogol-x", 7, 100, 10);
    expect(lines).toHaveLength(0);
  });

  it("logs final when total is not a multiple of interval", () => {
    const lines = captureOutput();
    logProgress("gogol-x", 105, 105, 10);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("105/105");
    expect(lines[0]).toContain("100%");
  });

  it("logs final when total is a multiple of interval", () => {
    const lines = captureOutput();
    logProgress("gogol-x", 100, 100, 10);
    // current=100 is a multiple of interval → shouldLog fires
    // isFinal: current===total → true, but singleLine=false so no extra newline
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("100/100");
    expect(lines[0]).toContain("100%");
  });

  it("singleLine mode uses \\r and pads to 60 chars", () => {
    const lines = captureOutput();
    logProgress("gogol-x", 10, 100, 10, true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\r/);
    expect(lines[0]!.length).toBeGreaterThanOrEqual(60);
  });

  it("singleLine mode prints newline after final", () => {
    const lines = captureOutput();
    logProgress("gogol-x", 105, 105, 10, true);
    // First line: the progress, second line: the newline
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.some((l) => l === "\n")).toBe(true);
  });

  it("singleLine mode prints newline when total is a multiple of interval", () => {
    const lines = captureOutput();
    logProgress("gogol-x", 100, 100, 10, true);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.some((l) => l === "\n")).toBe(true);
  });

  it("rounds percentage correctly", () => {
    const lines = captureOutput();
    logProgress("gogol-x", 33, 100, 33);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("33%");
  });
});
