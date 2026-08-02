/*
<MODULE_CONTRACT>
<purpose>CLI: read-only integrity & cross-quarter comparability checker for observatory SQLite databases.</purpose>
<non-goals>
  <item>Does not modify any database, recompute scores, or enforce statistical methodology.</item>
  <item>Check logic lives in validate-core.ts — this file only handles CLI + I/O.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation (WP0): baseline + reusable integrity/comparability gate before Q3.</item>
  <item>WP8: check logic extracted to validate-core.ts; added --db-dir for staging validation.</item>
  <item>Finding 8: --allow-drift downgrades data-quality drift ERRORs to WARN (confirmed real change).</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { collectFindings, formatReport, type Finding } from "./validate-core";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DB_DIR = path.resolve(process.cwd(), argValue("--db-dir") ?? path.join(".output", "db"));

async function findObservatoryDbs(dbDir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dbDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && /^observatory_\d{4}\.db$/i.test(e.name))
    .map((e) => path.join(dbDir, e.name))
    .sort();
}

async function main(): Promise<void> {
  const dbPaths = await findObservatoryDbs(DB_DIR);
  console.log("🔎 Observatory integrity & comparability check");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   dir: ${DB_DIR}`);
  if (dbPaths.length === 0) {
    console.log(`No observatory_YYYY.db found in ${DB_DIR}`);
    return;
  }

  const allowDrift = process.argv.includes("--allow-drift");
  if (allowDrift) {
    console.log("   drift: --allow-drift set — quality-drift ERRORs downgraded to WARN");
  }

  const findings: Finding[] = [];
  for (const dbPath of dbPaths) {
    findings.push(...collectFindings(dbPath, { allowDrift }));
  }

  const { text, errors, warns } = formatReport(findings);
  if (text) console.log(text);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Result: ${errors} error(s), ${warns} warning(s)`);
  if (errors > 0) {
    process.exitCode = 1;
    console.log("FAIL — fix ERROR findings before exporting/publishing.");
  } else {
    console.log("PASS — no blocking integrity errors.");
  }
}

void main().catch((error: unknown) => {
  console.error("[validate-observatory] Failed:", error);
  process.exitCode = 1;
});
