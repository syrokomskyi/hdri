/*
<MODULE_CONTRACT>
  <purpose>Independent verifier for liveness: checks every probe result against the corpus ground truth and the production liveness rule.</purpose>
  <non-goals><item>Does not re-run the probe — it validates outcomes against declared fixture truth.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: liveness verifier.</item>
</CHANGE_SUMMARY>
*/
import fs from "node:fs";
import Database from "better-sqlite3";
import {
  emitVerification,
  fail,
  openCorpus,
  parseAdapterArgs,
  proveOutputs,
  scratchPath,
} from "../common.js";

const args = parseAdapterArgs();
const corpus = openCorpus(args.fixtureRoot);
const db = new Database(scratchPath(args.workRoot, "work/liveness/liveness.sqlite"), {
  readonly: true,
});

const rows = db
  .prepare(
    "SELECT domain, is_live, http_status, final_url, error_code FROM liveness_checks",
  )
  .all() as {
  domain: string;
  is_live: number;
  http_status: number | null;
  final_url: string | null;
  error_code: string | null;
}[];
if (rows.length !== args.targets) fail(`LIVENESS_COUNT_MISMATCH:${rows.length}`);

const truth = new Map(
  (
    corpus
      .prepare("SELECT domain, live, http_status, redirect_to FROM sites")
      .all() as {
      domain: string;
      live: number;
      http_status: number;
      redirect_to: string | null;
    }[]
  ).map((s) => [s.domain, s]),
);

for (const row of rows) {
  const site = truth.get(row.domain);
  if (!site) fail(`LIVENESS_UNKNOWN_DOMAIN:${row.domain}`);
  // Production rule: live iff a scheme answered with status < 500 and != 429.
  const expectedLive = site.live === 1 && site.http_status < 500 && site.http_status !== 429;
  if ((row.is_live === 1) !== expectedLive)
    fail(`LIVENESS_VERDICT_MISMATCH:${row.domain}`);
  if (expectedLive && row.http_status !== site.http_status)
    fail(`LIVENESS_STATUS_MISMATCH:${row.domain}`);
  if (!expectedLive && site.live === 0 && site.http_status === 0 && row.error_code !== "ENOTFOUND")
    fail(`LIVENESS_ERROR_MISMATCH:${row.domain}:${row.error_code}`);
  if (site.redirect_to && expectedLive && row.final_url !== `https://${site.redirect_to}/`)
    fail(`LIVENESS_REDIRECT_MISMATCH:${row.domain}:${row.final_url}`);
}

const projection = fs
  .readFileSync(scratchPath(args.workRoot, "work/liveness/projection.jsonl"), "utf8")
  .trim()
  .split("\n");
if (projection.length !== rows.length) fail("LIVENESS_PROJECTION_COUNT_MISMATCH");

const receipt = JSON.parse(
  fs.readFileSync(scratchPath(args.workRoot, "work/liveness/liveness-receipt.json"), "utf8"),
) as { schema: string; checked: number; live: number };
const expectedLiveCount = [...truth.values()].filter(
  (s) => s.live === 1 && s.http_status < 500 && s.http_status !== 429,
).length;
if (
  receipt.schema !== "hdri-liveness@1" ||
  receipt.checked !== args.targets ||
  receipt.live !== expectedLiveCount
)
  fail("LIVENESS_RECEIPT_INVALID");

db.close();
corpus.close();
emitVerification(
  args,
  await proveOutputs(args.workRoot, [
    "work/liveness/liveness.sqlite",
    "work/liveness/projection.jsonl",
    "work/liveness/liveness-receipt.json",
  ]),
);
