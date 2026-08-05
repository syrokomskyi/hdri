import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { migrateLighthouse } from "@syrokomskyi/business-core/migrate";
import { upsertLighthouse, type Extracted } from "../gogols/LighthouseAuditGogol.js";

const makeExtracted = (overrides: Partial<Extracted> = {}): Extracted => ({
  performance: 90,
  accessibility: 95,
  bestPractices: 85,
  seo: 80,
  lcpMs: 1200,
  cls: 0.1,
  tbtMs: 200,
  lighthouseVersion: "13.4.1",
  ...overrides,
});

describe("upsertLighthouse", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    migrateLighthouse(db);
  });

  afterEach(() => {
    db.close();
  });

  it("inserts a lighthouse run with correct values", () => {
    const extracted = makeExtracted();
    upsertLighthouse(db, 1, "da-001", extracted, "abc123");
    const row = db
      .prepare("SELECT * FROM lighthouse_runs WHERE provisional_asset_id = ?")
      .get("da-001") as Record<string, unknown>;
    expect(row.site_id).toBe(1);
    expect(row.performance).toBe(90);
    expect(row.accessibility).toBe(95);
    expect(row.report_sha256).toBe("abc123");
  });

  it("updates values on conflict with same provisional_asset_id", () => {
    const extracted1 = makeExtracted({ performance: 90 });
    upsertLighthouse(db, 1, "da-001", extracted1, "hash1");
    const extracted2 = makeExtracted({ performance: 75, accessibility: 60 });
    upsertLighthouse(db, 1, "da-001", extracted2, "hash2");
    const row = db
      .prepare(
        "SELECT performance, accessibility, report_sha256 FROM lighthouse_runs WHERE provisional_asset_id = ?",
      )
      .get("da-001") as { performance: number; accessibility: number; report_sha256: string };
    expect(row.performance).toBe(75);
    expect(row.accessibility).toBe(60);
    expect(row.report_sha256).toBe("hash2");
  });

  it("is idempotent — calling twice with same data leaves one row", () => {
    const extracted = makeExtracted();
    upsertLighthouse(db, 1, "da-001", extracted, "hash1");
    upsertLighthouse(db, 1, "da-001", extracted, "hash1");
    const count = db.prepare("SELECT COUNT(*) as c FROM lighthouse_runs").get() as { c: number };
    expect(count.c).toBe(1);
  });
});
