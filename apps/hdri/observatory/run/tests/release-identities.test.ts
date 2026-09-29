/*
<MODULE_CONTRACT>
<purpose>Exercise release identity completeness through real disposable SQLite tables.</purpose>
<non-goals><item>Does not open retained quarterly databases or certify source authentication.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Cover provisional joins, run isolation and fail-closed identity projection.</item></CHANGE_SUMMARY>
*/
import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";
import { readReleaseIdentities } from "../release/release-identities";

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const id = "019ff219-69fe-7025-943c-dae2a8c37801";
function fixture() {
  const db = new Database(":memory:");
  databases.push(db);
  db.exec(`CREATE TABLE asset_states (asset_id TEXT, domain TEXT, run_id TEXT);
    CREATE TABLE asset_id_map (provisional_id TEXT, canonical_id TEXT, domain TEXT, first_seen TEXT);`);
  db.prepare("INSERT INTO asset_states VALUES (?, ?, ?)").run("da-one", "one.example", "q3");
  db.prepare("INSERT INTO asset_id_map VALUES (?, ?, ?, ?)").run("da-one", id, "one.example", "original-first-seen");
  return db;
}

test("exports canonical identity while preserving the explicit original mapping and first-seen value", () => {
  const db = fixture();
  db.prepare("INSERT INTO asset_states VALUES (?, ?, ?)").run("unmapped-old", "old.example", "q2");
  expect(readReleaseIdentities(db, "q3")).toEqual([{
    canonical_asset_id: id, provisional_id: "da-one", domain: "one.example", first_seen: "original-first-seen",
  }]);
  expect(db.prepare("SELECT asset_id FROM asset_states WHERE run_id='q3'").pluck().get()).toBe("da-one");
});

test("fails rather than dropping one unmapped target from an otherwise mapped run", () => {
  const db = fixture();
  db.prepare("INSERT INTO asset_states VALUES (?, ?, ?)").run("da-missing", "missing.example", "q3");
  expect(() => readReleaseIdentities(db, "q3")).toThrow("RELEASE_IDENTITY_MAPPING_MISSING");
});

test("never falls back to joining source IDs against the canonical namespace", () => {
  const db = fixture();
  db.prepare("UPDATE asset_states SET asset_id=?").run(id);
  expect(() => readReleaseIdentities(db, "q3")).toThrow("RELEASE_IDENTITY_MAPPING_MISSING");
});

test.each(["not-a-uuid", "019ff219-69fe-4025-943c-dae2a8c37801", "019ff219-69fe-7025-043c-dae2a8c37801"])("rejects invalid canonical UUIDv7 %s", value => {
  const db = fixture();
  db.prepare("UPDATE asset_id_map SET canonical_id=?").run(value);
  expect(() => readReleaseIdentities(db, "q3")).toThrow("RELEASE_IDENTITY_UUID_INVALID");
});

test("rejects mapping-domain substitution", () => {
  const db = fixture();
  db.exec("UPDATE asset_id_map SET domain='different.example'");
  expect(() => readReleaseIdentities(db, "q3")).toThrow("RELEASE_IDENTITY_DOMAIN_MISMATCH");
});

test("rejects duplicate state history within the selected run instead of silently choosing one", () => {
  const db = fixture();
  db.exec("INSERT INTO asset_states SELECT * FROM asset_states");
  expect(() => readReleaseIdentities(db, "q3")).toThrow("RELEASE_IDENTITY_DUPLICATE");
});

test("rejects two provisional targets sharing a canonical identity", () => {
  const db = fixture();
  db.exec("INSERT INTO asset_states VALUES ('da-two', 'two.example', 'q3')");
  db.prepare("INSERT INTO asset_id_map VALUES (?, ?, ?, ?)").run("da-two", id, "two.example", "original");
  expect(() => readReleaseIdentities(db, "q3")).toThrow("RELEASE_IDENTITY_DUPLICATE");
});

test("rejects empty and unknown run scope", () => {
  const db = fixture();
  expect(() => readReleaseIdentities(db, " ")).toThrow("RELEASE_IDENTITY_RUN_REQUIRED");
  expect(() => readReleaseIdentities(db, "missing")).toThrow("RELEASE_IDENTITIES_EMPTY");
});
