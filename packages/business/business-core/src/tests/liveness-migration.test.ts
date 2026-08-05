import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateLiveness } from "../migrate/liveness.js";

describe("quarterly liveness schema", () => {
  it("uses the stable provisional asset identity as the replay boundary", () => {
    const db = new Database(":memory:");
    migrateLiveness(db);
    const insert = db.prepare(`
      INSERT INTO liveness_checks (site_id, provisional_asset_id, domain, is_live)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provisional_asset_id) DO UPDATE SET
        site_id = excluded.site_id,
        domain = excluded.domain,
        is_live = excluded.is_live
    `);
    insert.run(10, "da-stable", "example.de", 1);
    insert.run(99, "da-stable", "example.de", 0);
    const rows = db.prepare("SELECT site_id, provisional_asset_id, is_live FROM liveness_checks").all();
    expect(rows).toEqual([{ site_id: 99, provisional_asset_id: "da-stable", is_live: 0 }]);
    db.close();
  });
});
