import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { migrateAxe } from "@syrokomskyi/business-core/migrate";
import { upsertAxe, type Extracted } from "../gogols/AxeAuditGogol.js";

const makeExtracted = (overrides: Partial<Extracted> = {}): Extracted => ({
  violationsTotal: 10,
  criticalCount: 2,
  seriousCount: 3,
  moderateCount: 4,
  minorCount: 1,
  nodesScanned: 500,
  axeVersion: "4.12.1",
  ...overrides,
});

describe("upsertAxe", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    migrateAxe(db);
  });

  afterEach(() => {
    db.close();
  });

  it("inserts an axe run with correct values", () => {
    const extracted = makeExtracted();
    upsertAxe(db, 1, "da-001", extracted, "abc123");
    const row = db
      .prepare("SELECT * FROM axe_runs WHERE provisional_asset_id = ?")
      .get("da-001") as Record<string, unknown>;
    expect(row.site_id).toBe(1);
    expect(row.violations_total).toBe(10);
    expect(row.critical_count).toBe(2);
    expect(row.report_sha256).toBe("abc123");
  });

  it("updates values on conflict with same provisional_asset_id", () => {
    const extracted1 = makeExtracted({ violationsTotal: 10 });
    upsertAxe(db, 1, "da-001", extracted1, "hash1");
    const extracted2 = makeExtracted({ violationsTotal: 25, criticalCount: 5 });
    upsertAxe(db, 1, "da-001", extracted2, "hash2");
    const row = db
      .prepare(
        "SELECT violations_total, critical_count, report_sha256 FROM axe_runs WHERE provisional_asset_id = ?",
      )
      .get("da-001") as { violations_total: number; critical_count: number; report_sha256: string };
    expect(row.violations_total).toBe(25);
    expect(row.critical_count).toBe(5);
    expect(row.report_sha256).toBe("hash2");
  });

  it("is idempotent — calling twice with same data leaves one row", () => {
    const extracted = makeExtracted();
    upsertAxe(db, 1, "da-001", extracted, "hash1");
    upsertAxe(db, 1, "da-001", extracted, "hash1");
    const count = db.prepare("SELECT COUNT(*) as c FROM axe_runs").get() as { c: number };
    expect(count.c).toBe(1);
  });
});
