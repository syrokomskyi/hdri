import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migrateCore } from "@syrokomskyi/business-core/migrate";
import { PipelinePauseError } from "@syrokomskyi/pipeline-core";
import { checkMinSitesGuard } from "../gogols/check-min-sites-guard.js";

function makeDb(siteCount = 0): Database.Database {
  const db = new Database(":memory:");
  migrateCore(db);
  if (siteCount > 0) {
    const insert = db.prepare(
      "INSERT INTO sites (domain, created_at) VALUES (?, unixepoch())",
    );
    for (let i = 0; i < siteCount; i++) {
      insert.run(`site-${i}.example.com`);
    }
  }
  return db;
}

describe("checkMinSitesGuard", () => {
  it("throws PipelinePauseError when sites table is empty and threshold is 1 (sealing mode)", () => {
    const db = makeDb(0);
    expect(() => checkMinSitesGuard(db, 1, -1)).toThrow(PipelinePauseError);
    db.close();
  });

  it("passes when sites table has rows above threshold (sealing mode)", () => {
    const db = makeDb(5);
    expect(() => checkMinSitesGuard(db, 1, -1)).not.toThrow();
    db.close();
  });

  it("does not throw when threshold is 0 (guard disabled)", () => {
    const db = makeDb(0);
    expect(() => checkMinSitesGuard(db, 0, -1)).not.toThrow();
    db.close();
  });

  it("does not throw when maxPages >= 0 (diagnostic run)", () => {
    const db = makeDb(0);
    expect(() => checkMinSitesGuard(db, 1, 10)).not.toThrow();
    db.close();
  });

  it("throws PipelinePauseError when site count is below custom threshold", () => {
    const db = makeDb(3);
    expect(() => checkMinSitesGuard(db, 5, -1)).toThrow(PipelinePauseError);
    db.close();
  });
});
