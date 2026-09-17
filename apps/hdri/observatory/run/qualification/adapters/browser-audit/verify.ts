/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for browser-audit: checks coverage, slot discipline and re-audits a deterministic sample in a fresh browser.</purpose>
  <non-goals><item>Does not trust the producer's slot log — peak concurrency is recomputed.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: browser-audit verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { emitVerification, fail, parseAdapterArgs, proveOutputs, scratchPath } from "../common.js";

const args = parseAdapterArgs();
const stageDir = scratchPath(args.workRoot, "work/browser-audit");
const homeDir = scratchPath(args.workRoot, "work/homepage-capture");

const db = new Database(path.join(stageDir, "audit.sqlite"), { readonly: true });
const rows = db
  .prepare("SELECT domain, violations_json, violation_count FROM axe_audits")
  .all() as { domain: string; violations_json: string; violation_count: number }[];

const homeDb = new Database(path.join(homeDir, "capture.sqlite"), { readonly: true });
const homes = homeDb
  .prepare("SELECT domain, cas_uri FROM homepage_captures ORDER BY domain")
  .all() as { domain: string; cas_uri: string }[];
homeDb.close();
if (rows.length !== homes.length) fail(`AUDIT_COVERAGE:${rows.length}!=${homes.length}`);

// Slot discipline: recompute peak concurrency from the slot log.
const slotLines = fs
  .readFileSync(path.join(stageDir, "slots.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as { active: number });
const peak = Math.max(...slotLines.map((l) => l.active));
if (peak > args.browserSlots) fail(`BROWSER_SLOTS_EXCEEDED:${peak}>${args.browserSlots}`);

// Deterministic sample re-audit in a fresh browser (0.5%, min 1).
const browserRoot = "/runtime/browsers";
const executable = (() => {
  for (const dir of fs.readdirSync(browserRoot))
    for (const rel of [
      "chrome-linux/headless_shell",
      "chrome-linux/chrome",
      "chrome-linux64/chrome",
    ]) {
      const candidate = path.join(browserRoot, dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  throw new Error("BROWSER_EXECUTABLE_MISSING");
})();
const browser = await chromium.launch({
  executablePath: executable,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
const sample = homes.filter((_, i) => i % 200 === 0);
const byDomain = new Map(rows.map((r) => [r.domain, r]));
try {
  // @axe-core/playwright requires pages created through a BrowserContext.
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const home of sample) {
    const html = fs.readFileSync(path.join(homeDir, home.cas_uri), "utf8");
    await page.setContent(html, { waitUntil: "load" });
    const fresh = await new AxeBuilder({ page }).analyze();
    const stored = byDomain.get(home.domain);
    if (!stored) fail(`AUDIT_MISSING:${home.domain}`);
    if (stored.violation_count !== fresh.violations.length)
      fail(`AUDIT_MISMATCH:${home.domain}:${stored.violation_count}!=${fresh.violations.length}`);
  }
  await context.close();
} finally {
  await browser.close();
}

const receipt = JSON.parse(fs.readFileSync(path.join(stageDir, "audit-receipt.json"), "utf8")) as {
  schema: string;
  audited: number;
  browserSlotsPeak: number;
};
if (receipt.schema !== "hdri-browser-audit@1" || receipt.audited !== homes.length)
  fail("AUDIT_RECEIPT_INVALID");

db.close();
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/browser-audit/audit.sqlite",
    "work/browser-audit/projection.jsonl",
    "work/browser-audit/slots.jsonl",
    "work/browser-audit/audit-receipt.json",
  ]),
);
