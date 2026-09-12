/*
<MODULE_CONTRACT>
<purpose>Read-only diagnostic script reporting expected/succeeded/unavailable/excluded/failed work IDs for the profile extraction stage.</purpose>
<non-goals>
  <item>Does not modify any database or file.</item>
  <item>Does not run extractions or fetch pages.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Open diagnostic databases read-only so a mistaken input cannot create a database or change its journal mode.</item>
  <item>RFC-0104: initial implementation — reads pages DB and reports extraction coverage per ext_* table.</item>
</CHANGE_SUMMARY>
*/

import { parseArgs } from "node:util";
import { openReadOnlyDb } from "./db/connection.js";
import { getPagesDbPath } from "./paths.js";

const { values } = parseArgs({
  options: {
    capsule: { type: "string", short: "c" },
    json: { type: "boolean", short: "j" },
  },
});

const capsulePath = values.capsule;
const jsonMode = values.json ?? false;

if (!capsulePath) {
  console.error("Usage: profile-coverage --capsule <path> [--json]");
  process.exit(1);
}

const pagesDbPath = getPagesDbPath(capsulePath);
const db = openReadOnlyDb(pagesDbPath);

const extTables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ext_%' ORDER BY name`,
  )
  .all() as { name: string }[];

const tableCoverage = extTables.map(({ name: table }) => {
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
  ).n;
  const present = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE present = 1`)
      .get() as { n: number }
  ).n;
  const unavailable = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE present = 0`)
      .get() as { n: number }
  ).n;
  return { table, total, present, unavailable };
});

const totalObservations = (
  db.prepare(`SELECT COUNT(*) AS n FROM page_observations`).get() as { n: number }
).n;

const totalPageContents = (
  db.prepare(`SELECT COUNT(*) AS n FROM page_contents`).get() as { n: number }
).n;

const totalSitePages = (
  db.prepare(`SELECT COUNT(*) AS n FROM site_pages`).get() as { n: number }
).n;

db.close();

const report = {
  schema: "profile-coverage@1",
  operation: "profile-coverage",
  status: "reported",
  inputFingerprint: capsulePath,
  evidenceRefs: {
    totalObservations,
    totalPageContents,
    totalSitePages,
    extTableCount: extTables.length,
  },
  tableCoverage,
  violations: tableCoverage.filter(
    (t) => t.total > 0 && t.present + t.unavailable !== t.total,
  ),
};

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Profile Coverage Report`);
  console.log(`========================`);
  console.log(`Observations: ${totalObservations}`);
  console.log(`Page contents: ${totalPageContents}`);
  console.log(`Site pages: ${totalSitePages}`);
  console.log(`Ext tables: ${extTables.length}`);
  console.log();
  for (const t of tableCoverage) {
    console.log(
      `  ${t.table}: total=${t.total} present=${t.present} unavailable=${t.unavailable}`,
    );
  }
  if (report.violations.length > 0) {
    console.log(`\nViolations: ${report.violations.length}`);
    process.exit(1);
  }
}
