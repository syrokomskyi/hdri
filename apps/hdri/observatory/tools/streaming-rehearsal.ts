/*
<MODULE_CONTRACT>
<purpose>Rehearses the HDRI SQLite-to-partition streaming contract at production observation scale.</purpose>
<non-goals><item>Does not write a production vault or retain generated observations.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0027 adds a reproducible 5M-row memory rehearsal.</item></CHANGE_SUMMARY>
*/

import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const rows = Number(process.argv[2] ?? 5_000_000);
const artifactPath = process.argv[3];
if (!Number.isInteger(rows) || rows <= 0) throw new Error("rows must be a positive integer");
if (!artifactPath) throw new Error("artifact path is required");

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-streaming-"));
const db = new Database(path.join(tempDir, "rehearsal.sqlite"));
let peakRss = process.memoryUsage().rss;
const startedAt = new Date().toISOString();
try {
  db.exec(`CREATE TABLE observations(seq INTEGER PRIMARY KEY, payload_json TEXT NOT NULL)`);
  db.prepare(`
    WITH RECURSIVE generated(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM generated WHERE n < ?
    )
    INSERT INTO observations(seq, payload_json)
    SELECT n, '{"observation_id":"o-' || n || '","value_num":' || n || '}' FROM generated
  `).run(rows);

  let partitionRows = 0;
  let partitions = 0;
  let observedRows = 0;
  for (const row of db.prepare(`SELECT payload_json FROM observations ORDER BY seq`).iterate() as IterableIterator<{ payload_json: string }>) {
    JSON.parse(row.payload_json);
    partitionRows++;
    observedRows++;
    if (partitionRows === 100_000) {
      partitions++;
      partitionRows = 0;
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }
  }
  if (partitionRows > 0) partitions++;
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const evidence = {
    schemaVersion: "1",
    startedAt,
    finishedAt: new Date().toISOString(),
    rows: observedRows,
    partitionRows: 100_000,
    partitions,
    peakRssBytes: peakRss,
    heapLimitBytes: 2_147_483_648,
    passed: observedRows === rows && peakRss < 2_147_483_648,
  };
  await fs.mkdir(path.dirname(path.resolve(artifactPath)), { recursive: true });
  await fs.writeFile(path.resolve(artifactPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  if (!evidence.passed) process.exitCode = 1;
} finally {
  db.close();
  await fs.rm(tempDir, { recursive: true, force: true });
}
