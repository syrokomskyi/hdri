import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { writeSourceAudit } from "../source-audit-report.js";
import { auditSourceBatch } from "../source-audit.js";
import { decodeSourceBytes } from "../gogols/parse-sources-report.js";

const owned: string[] = [];
afterEach(async () => {
  for (const root of owned.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const html = (id: number, url: string | null = "https://company.example") =>
  `<input name="eintragId" value="${id}"><script type="application/ld+json">${JSON.stringify({ "@type": "LocalBusiness", name: "Example", url })}</script>`;
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-source-audit-test-"));
  owned.push(root);
  const input = path.join(root, "input"),
    source = path.join(input, "city.stadtbranchenbuch.com");
  await fs.mkdir(source, { recursive: true });
  return { root, input, source, report: path.join(root, "report") };
}
test("audit reconciles every file and occurrence without inventing baseline novelty", async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.source, "1.html"), html(1));
  await fs.writeFile(path.join(f.source, "2.html"), html(2));
  await fs.writeFile(path.join(f.source, "3.html"), html(3, null));
  await fs.writeFile(path.join(f.source, "4.html"), "<h1>Unknown</h1>");
  await fs.writeFile(path.join(f.source, "asset.bin"), "asset");
  const result = await writeSourceAudit(f.input, f.report);
  expect(result).toMatchObject({
    files: 5,
    occurrences: 3,
    acceptedOccurrences: 2,
    uniqueDomains: 1,
    duplicateOccurrences: 1,
    excluded: { no_url: 1, bad_url: 0, stop_domain: 0 },
    status: "needs-review",
    newDomains: null,
    baseline: null,
    operationallyQualified: false,
    dispositions: { parsed: 3, unrecognized: 1, "unsupported-extension": 1 },
  });
  const evidence = await fs.readFile(path.join(f.report, "files.ndjson"));
  expect(result.evidence).toEqual({
    sha256: createHash("sha256").update(evidence).digest("hex"),
    bytes: evidence.length,
  });
  const rows = evidence
    .toString()
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(rows[0]).toMatchObject({
    path: "city.stadtbranchenbuch.com/1.html",
    parserKind: "sbb-detail",
    occurrences: [{ key: "sbb_1", role: "primary", domain: "company.example", reason: null }],
  });
  await expect(writeSourceAudit(f.input, f.report)).rejects.toThrow("FRESH_ROOT_REQUIRED");
});
test("audit rejects overlapping output before writing into input", async () => {
  const f = await fixture();
  await expect(writeSourceAudit(f.input, path.join(f.input, "report"))).rejects.toThrow(
    "OVERLAPPING_ROOTS",
  );
  expect(await fs.readdir(f.input)).toEqual(["city.stadtbranchenbuch.com"]);
});
test("audit detects input changes after yielding a parsed file", async () => {
  const f = await fixture(),
    file = path.join(f.source, "1.html");
  await fs.writeFile(file, html(1));
  const iterator = auditSourceBatch(f.input);
  expect((await iterator.next()).done).toBe(false);
  await fs.writeFile(file, html(2));
  await expect(iterator.next()).rejects.toThrow("SOURCE_BATCH_CHANGED");
});
test("audit rejects symlinks and leaves no completion summary", async () => {
  const f = await fixture();
  await fs.symlink(f.root, path.join(f.source, "link"));
  await expect(writeSourceAudit(f.input, f.report)).rejects.toThrow("SOURCE_SPECIAL_FILE");
  await expect(fs.stat(path.join(f.report, "summary.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
test("invalid encoded source bytes remain an explicit error outcome", async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.source, "1.html"), Buffer.from([0xff]));
  expect(await writeSourceAudit(f.input, f.report)).toMatchObject({
    dispositions: { error: 1 },
    files: 1,
    status: "needs-review",
  });
});
test("audit reconciles technical policies and empty captures without adding domains or exposing cookie values", async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.source, "robots.txt"), gzipSync("User-agent: *\nDisallow: /\n"));
  await fs.writeFile(path.join(f.source, "1.html"), "");
  await fs.writeFile(
    path.join(f.source, "cookies.txt"),
    "# HTTrack Website Copier Cookie File\nsecret-sentinel",
  );
  const result = await writeSourceAudit(f.input, f.report);
  expect(result).toMatchObject({
    files: 3,
    occurrences: 0,
    uniqueDomains: 0,
    dispositions: { ignored: 1, unrecognized: 2 },
    documentKinds: { "robots-policy": 1, "empty-capture": 1, "sensitive-cookie-jar": 1 },
    operationallyQualified: false,
    status: "needs-review",
  });
  expect(await fs.readFile(path.join(f.report, "files.ndjson"), "utf8")).not.toContain(
    "secret-sentinel",
  );
});
test("decoding preserves declared Windows-1252 umlauts and rejects unknown encodings", () => {
  expect(
    decodeSourceBytes(Buffer.from('<meta charset="iso-8859-1">Gr\xfcnde', "latin1"), ".html"),
  ).toContain("Gründe");
  expect(() =>
    decodeSourceBytes(Buffer.from('<meta charset="not-an-encoding">'), ".html"),
  ).toThrow();
});
test("public estimator forwards explicit roots and review-required exit status", async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.source, "1.html"), "<h1>Unknown</h1>");
  const command = fileURLToPath(
    new URL("../../../../../../scripts/batch-estimate.ts", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      "--conditions=@syrokomskyi/source",
      command,
      "--batch-root",
      f.input,
      "--report-dir",
      f.report,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({
    files: 1,
    status: "needs-review",
    operationallyQualified: false,
  });
});
