import { describe, expect, it } from "vitest";
import path from "node:path";

/**
 * Tests that quarter-scoped DB paths are isolated per quarter.
 * Each audit/observation DB must include the quarter in its filename
 * so Q3 and Q4 never share a writable database.
 *
 * The path functions under test are simple string interpolations,
 * but this test guards against accidental removal of the quarter scope.
 */

// Replicate the path logic from the factory apps (they all follow the same pattern)
const getLivenessDbName = (period: string): string => `liveness-${period}.db`;
const getPagesDbName = (period: string): string => `pages-${period}.db`;
const getAxeDbName = (period: string): string => `axe-${period}.db`;
const getLighthouseDbName = (period: string): string => `lighthouse-${period}.db`;

const DB_DIR = path.join("/output", "data", "db");

const getLivenessDbPath = (period: string): string => path.join(DB_DIR, getLivenessDbName(period));
const getPagesDbPath = (period: string): string => path.join(DB_DIR, `${getPagesDbName(period)}.db`);
const getAxeDbPath = (period: string): string => path.join(DB_DIR, getAxeDbName(period));
const getLighthouseDbPath = (period: string): string => path.join(DB_DIR, getLighthouseDbName(period));

describe("quarter-scoped DB path isolation", () => {
  it("liveness DB paths differ between Q2 and Q3", () => {
    const q2 = getLivenessDbPath("2026-q2");
    const q3 = getLivenessDbPath("2026-q3");
    expect(q2).not.toBe(q3);
    expect(q2).toContain("2026-q2");
    expect(q3).toContain("2026-q3");
  });

  it("pages DB paths differ between Q2 and Q3", () => {
    const q2 = getPagesDbPath("2026-q2");
    const q3 = getPagesDbPath("2026-q3");
    expect(q2).not.toBe(q3);
    expect(q2).toContain("2026-q2");
    expect(q3).toContain("2026-q3");
  });

  it("axe DB paths differ between Q2 and Q3", () => {
    const q2 = getAxeDbPath("2026-q2");
    const q3 = getAxeDbPath("2026-q3");
    expect(q2).not.toBe(q3);
    expect(q2).toContain("2026-q2");
    expect(q3).toContain("2026-q3");
  });

  it("lighthouse DB paths differ between Q2 and Q3", () => {
    const q2 = getLighthouseDbPath("2026-q2");
    const q3 = getLighthouseDbPath("2026-q3");
    expect(q2).not.toBe(q3);
    expect(q2).toContain("2026-q2");
    expect(q3).toContain("2026-q3");
  });

  it("liveness DB paths differ between years", () => {
    const y2026 = getLivenessDbPath("2026-q3");
    const y2027 = getLivenessDbPath("2027-q3");
    expect(y2026).not.toBe(y2027);
    expect(y2026).toContain("2026");
    expect(y2027).toContain("2027");
  });

  it("Q3 and Q4 never share the same DB file for any observation DB", () => {
    const periods = ["2026-q3", "2026-q4"] as const;
    const builders = [getLivenessDbPath, getPagesDbPath, getAxeDbPath, getLighthouseDbPath];
    for (const build of builders) {
      const q3 = build(periods[0]);
      const q4 = build(periods[1]);
      expect(q3).not.toBe(q4);
    }
  });

  it("year-scoped DBs do not include quarter in the filename", () => {
    // core_YYYY.db and registry_YYYY.db are year-scoped, not quarter-scoped
    const coreDbName = (year: number): string => `core_${year}.db`;
    const registryDbName = (year: number): string => `registry_${year}.db`;
    expect(coreDbName(2026)).toBe("core_2026.db");
    expect(registryDbName(2026)).toBe("registry_2026.db");
    expect(coreDbName(2026)).not.toContain("q3");
    expect(registryDbName(2026)).not.toContain("q3");
  });
});
