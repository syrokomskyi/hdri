/*
<MODULE_CONTRACT>
  <purpose>Production adapter: run real axe accessibility audits in headless chromium over captured homepages, bounded by the declared browser-slot limit.</purpose>
  <non-goals><item>Does not contact the network — pages are loaded from CAS bytes via setContent.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: browser-audit producer with enforced browser slots.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium, type Browser } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import {
  appendJsonl,
  loadFixtureManifest,
  parseAdapterArgs,
  scratchPath,
  writeJsonAtomic,
} from "../common.js";

const args = parseAdapterArgs();
const manifest = loadFixtureManifest(args.fixtureRoot);
const stageDir = path.join(args.workRoot, args.stage);
const homeDir = scratchPath(args.workRoot, "work/homepage-capture");

// The controller mounts the frozen browser closure read-only at /runtime/browsers.
const browserRoot = "/runtime/browsers";
const executable = (() => {
  for (const dir of fs.readdirSync(browserRoot)) {
    for (const rel of [
      "chrome-linux/headless_shell",
      "chrome-linux/chrome",
      "chrome-linux64/chrome",
    ]) {
      const candidate = path.join(browserRoot, dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error("BROWSER_EXECUTABLE_MISSING");
})();

const homeDb = new Database(path.join(homeDir, "capture.sqlite"), { readonly: true });
const homes = homeDb
  .prepare("SELECT domain, cas_uri FROM homepage_captures ORDER BY domain")
  .all() as { domain: string; cas_uri: string }[];
homeDb.close();

const db = new Database(path.join(stageDir, "audit.sqlite"));
db.pragma("journal_mode = DELETE");
db.exec(`
  CREATE TABLE axe_audits (
    domain TEXT PRIMARY KEY,
    violations_json TEXT NOT NULL,
    violation_count INTEGER NOT NULL,
    passes INTEGER NOT NULL,
    audited_at TEXT NOT NULL
  ) WITHOUT ROWID;
`);
const insert = db.prepare(
  "INSERT INTO axe_audits(domain, violations_json, violation_count, passes, audited_at) VALUES (?, ?, ?, ?, ?)",
);
const projection = path.join(stageDir, "projection.jsonl");
const slotsLog = path.join(stageDir, "slots.jsonl");

const slots = Math.min(args.browserSlots, 4);
const browser: Browser = await chromium.launch({
  executablePath: executable,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

let active = 0;
let peak = 0;
// Workers pull home indices concurrently, so axe completion order is
// non-deterministic. Buffer each projection row by its homes index and flush in
// deterministic `ORDER BY domain` order after all workers finish.
const queue = homes.map((_, index) => index);
const projectionRows: (
  { domain: string; violation_count: number; rule_ids: string[] } | undefined
)[] = new Array(homes.length);
const worker = async (): Promise<void> => {
  // @axe-core/playwright requires pages created through a BrowserContext.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    while (queue.length) {
      const index = queue.shift()!;
      const home = homes[index]!;
      active++;
      peak = Math.max(peak, active);
      await appendJsonl(slotsLog, { t: manifest.frozenTime, active });
      const html = fs.readFileSync(path.join(homeDir, home.cas_uri), "utf8");
      await page.setContent(html, { waitUntil: "load" });
      const result = await new AxeBuilder({ page }).analyze();
      const violations = result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
      }));
      insert.run(
        home.domain,
        JSON.stringify(violations),
        violations.length,
        result.passes.length,
        manifest.frozenTime,
      );
      projectionRows[index] = {
        domain: home.domain,
        violation_count: violations.length,
        rule_ids: violations.map((v) => v.id).sort(),
      };
      active--;
    }
  } finally {
    await context.close();
  }
};
await Promise.all(Array.from({ length: slots }, () => worker()));
await browser.close();
for (const row of projectionRows) await appendJsonl(projection, row);

await writeJsonAtomic(path.join(stageDir, "audit-receipt.json"), {
  schema: "hdri-browser-audit@1",
  stage: args.stage,
  audited: homes.length,
  browserSlotsDeclared: slots,
  browserSlotsPeak: peak,
  auditedAt: manifest.frozenTime,
});
db.close();
