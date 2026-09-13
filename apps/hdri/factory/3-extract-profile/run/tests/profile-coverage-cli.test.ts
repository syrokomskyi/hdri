import { afterEach, beforeEach, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-profile-diagnostic-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
const run = (dbPath: string) =>
  spawnSync(
    process.execPath,
    [
      "--import",
      require.resolve("tsx/esm"),
      fileURLToPath(new URL("../profile-coverage.ts", import.meta.url)),
      "--db",
      dbPath,
      "--json",
    ],
    { cwd: root, encoding: "utf8", timeout: 15000 },
  );

it("does not create a missing diagnostic database", async () => {
  const result = run(path.join(root, "missing.db"));
  expect(result.status).not.toBe(0);
  expect(await fs.readdir(root)).toEqual([]);
});

it("reports the explicitly supplied database without modifying its bytes or journal mode", async () => {
  const target = path.join(root, "profile.db");
  const db = new Database(target);
  db.exec(
    "CREATE TABLE page_observations(id INTEGER); CREATE TABLE page_contents(id INTEGER); CREATE TABLE site_pages(id INTEGER); CREATE TABLE ext_fixture(present INTEGER); INSERT INTO ext_fixture VALUES (1), (0);",
  );
  db.close();
  const before = await fs.readFile(target);
  const result = run(target);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    inputDbPath: target,
    violations: [],
    tableCoverage: [{ table: "ext_fixture", total: 2, present: 1, unavailable: 1 }],
  });
  expect(await fs.readFile(target)).toEqual(before);
  expect(await fs.readdir(root)).toEqual(["profile.db"]);
});

it("returns failure for invalid coverage in JSON mode", () => {
  const target = path.join(root, "profile.db");
  const db = new Database(target);
  db.exec(
    "CREATE TABLE page_observations(id INTEGER); CREATE TABLE page_contents(id INTEGER); CREATE TABLE site_pages(id INTEGER); CREATE TABLE ext_fixture(present INTEGER); INSERT INTO ext_fixture VALUES (2);",
  );
  db.close();
  const result = run(target);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).violations).toHaveLength(1);
});
