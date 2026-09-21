import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { sourceClosureSha256 } from "../source-audit.js";
import {
  buildSourceExclusions,
  exclusionsClosureSha256,
  loadVerifiedSourceExclusions,
  parseSourceExclusions,
  SOURCE_EXCLUSIONS_SCHEMA,
  type SourceExclusionsFile,
} from "../source-exclusions.js";

const owned: string[] = [];
afterEach(async () => {
  for (const root of owned.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

const sha256hex = (buf: Buffer | string): string =>
  createHash("sha256").update(buf).digest("hex");

/** Batch root with two parsed-able files plus one file per excludable disposition. */
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-source-exclusions-test-"));
  owned.push(root);
  const batchRoot = path.join(root, "batch");
  const source = path.join(batchRoot, "city.stadtbranchenbuch.com");
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(
    path.join(source, "ok.html"),
    `<input name="eintragId" value="1"><script type="application/ld+json">${JSON.stringify({ "@type": "LocalBusiness", name: "Example", url: "https://company.example" })}</script>`,
  );
  await fs.writeFile(path.join(source, "unrecognized.html"), "<h1>Unknown</h1>");
  await fs.writeFile(path.join(source, "asset.bin"), "asset-bytes");
  return { root, batchRoot };
}

const fileRow = async (batchRoot: string, logicalPath: string, disposition: string) => {
  const bytes = await fs.readFile(path.join(batchRoot, logicalPath));
  return { path: logicalPath, sha256: sha256hex(bytes), bytes: bytes.length, disposition };
};

/** Writes a pinned inventory + summary consistent with the live batch. */
async function pinAudit(
  root: string,
  batchRoot: string,
  rows: Array<{ path: string; sha256: string; bytes: number; disposition: string }>,
) {
  const inventoryPath = path.join(root, "files.ndjson");
  const summaryPath = path.join(root, "summary.json");
  await fs.writeFile(inventoryPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const dispositions: Record<string, number> = {};
  for (const r of rows) dispositions[r.disposition] = (dispositions[r.disposition] ?? 0) + 1;
  const closure = await sourceClosureSha256(batchRoot);
  await fs.writeFile(
    summaryPath,
    JSON.stringify({ sourceSha256: closure.sourceSha256, dispositions }),
  );
  return { inventoryPath, summaryPath };
}

const OPTS = (f: { batchRoot: string }, audit: { inventoryPath: string; summaryPath: string }) => ({
  batchRoot: f.batchRoot,
  batchName: "2026-q3-de-01",
  inventoryPath: audit.inventoryPath,
  summaryPath: audit.summaryPath,
  authorization: "docs/reviews/code/apps-hdri-observatory/review-2026-09-15-16-15-apps-hdri-observatory.md",
});

test("buildSourceExclusions binds the exact unresolved set, both closures and the authorization", async () => {
  const f = await fixture();
  const rows = [
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/ok.html", "parsed"),
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/unrecognized.html", "unrecognized"),
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/asset.bin", "unsupported-extension"),
  ];
  const audit = await pinAudit(f.root, f.batchRoot, rows);
  const artifact = await buildSourceExclusions(OPTS(f, audit));

  expect(artifact.schema).toBe(SOURCE_EXCLUSIONS_SCHEMA);
  expect(artifact.batch).toBe("2026-q3-de-01");
  expect(artifact.exclusions).toHaveLength(2);
  expect(artifact.exclusions.map((e) => e.path)).toEqual([
    "city.stadtbranchenbuch.com/asset.bin",
    "city.stadtbranchenbuch.com/unrecognized.html",
  ]);
  expect(artifact.exclusionsSha256).toBe(exclusionsClosureSha256(artifact.exclusions));
  expect(artifact.inventorySha256).toBe(
    sha256hex(await fs.readFile(audit.inventoryPath)),
  );
  const closure = await sourceClosureSha256(f.batchRoot);
  expect(artifact.sourceSha256).toBe(closure.sourceSha256);
});

test("buildSourceExclusions rejects a count that disagrees with the audited dispositions", async () => {
  const f = await fixture();
  const rows = [
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/unrecognized.html", "unrecognized"),
  ];
  const audit = await pinAudit(f.root, f.batchRoot, [
    ...rows,
    // Summary claims a second unresolved file that the inventory does not list.
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/asset.bin", "unsupported-extension"),
  ]);
  // Remove the asset row from the inventory only — count now disagrees with the summary.
  await fs.writeFile(audit.inventoryPath, `${JSON.stringify(rows[0])}\n`);
  await expect(buildSourceExclusions(OPTS(f, audit))).rejects.toThrow(
    "EXCLUSION_COUNT_MISMATCH",
  );
});

test("buildSourceExclusions fails when the batch drifted since the audit", async () => {
  const f = await fixture();
  const rows = [
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/unrecognized.html", "unrecognized"),
  ];
  const audit = await pinAudit(f.root, f.batchRoot, rows);
  await fs.appendFile(path.join(f.batchRoot, "city.stadtbranchenbuch.com/ok.html"), " ");
  await expect(buildSourceExclusions(OPTS(f, audit))).rejects.toThrow(
    "SOURCE_CLOSURE_CHANGED",
  );
});

test("buildSourceExclusions fails when a listed file's bytes changed", async () => {
  const f = await fixture();
  const target = "city.stadtbranchenbuch.com/unrecognized.html";
  const stale = await fileRow(f.batchRoot, target, "unrecognized");
  await fs.writeFile(path.join(f.batchRoot, target), "<h1>Changed</h1>");
  const audit = await pinAudit(f.root, f.batchRoot, [
    stale,
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/ok.html", "parsed"),
  ]);
  // Re-pin the summary closure to the drifted batch so only the entry check can fire.
  const closure = await sourceClosureSha256(f.batchRoot);
  await fs.writeFile(
    audit.summaryPath,
    JSON.stringify({
      sourceSha256: closure.sourceSha256,
      dispositions: { unrecognized: 1, parsed: 1 },
    }),
  );
  await expect(buildSourceExclusions(OPTS(f, audit))).rejects.toThrow(
    "EXCLUSION_SOURCE_CHANGED",
  );
});

test("buildSourceExclusions refuses an empty selection", async () => {
  const f = await fixture();
  const audit = await pinAudit(f.root, f.batchRoot, [
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/ok.html", "parsed"),
  ]);
  await expect(buildSourceExclusions(OPTS(f, audit))).rejects.toThrow(
    "EMPTY_EXCLUSION_SET",
  );
});

test("parseSourceExclusions rejects altered entries via the selected closure", async () => {
  const f = await fixture();
  const rows = [
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/unrecognized.html", "unrecognized"),
  ];
  const audit = await pinAudit(f.root, f.batchRoot, rows);
  const artifact = await buildSourceExclusions(OPTS(f, audit));
  const tampered = JSON.parse(JSON.stringify(artifact)) as SourceExclusionsFile;
  tampered.exclusions[0]!.bytes += 1;
  expect(() => parseSourceExclusions(tampered)).toThrow("EXCLUSION_CLOSURE_MISMATCH");
  expect(() => parseSourceExclusions({ schema: "other" })).toThrow(
    "INVALID_SOURCE_EXCLUSIONS_SCHEMA",
  );
});

test("loadVerifiedSourceExclusions returns null without an artifact or for another batch", async () => {
  const f = await fixture();
  const missing = path.join(f.root, "absent.json");
  await expect(
    loadVerifiedSourceExclusions(missing, "2026-q3-de-01", f.batchRoot),
  ).resolves.toBeNull();

  const rows = [
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/unrecognized.html", "unrecognized"),
  ];
  const audit = await pinAudit(f.root, f.batchRoot, rows);
  const artifact = await buildSourceExclusions(OPTS(f, audit));
  const artifactPath = path.join(f.root, "source-exclusions.json");
  await fs.writeFile(artifactPath, JSON.stringify(artifact));
  await expect(
    loadVerifiedSourceExclusions(artifactPath, "2026-q4-de-01", f.batchRoot),
  ).resolves.toBeNull();
});

test("loadVerifiedSourceExclusions verifies the live batch and returns the closed lookup", async () => {
  const f = await fixture();
  const rows = [
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/ok.html", "parsed"),
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/unrecognized.html", "unrecognized"),
    await fileRow(f.batchRoot, "city.stadtbranchenbuch.com/asset.bin", "unsupported-extension"),
  ];
  const audit = await pinAudit(f.root, f.batchRoot, rows);
  const artifact = await buildSourceExclusions(OPTS(f, audit));
  const artifactPath = path.join(f.root, "source-exclusions.json");
  await fs.writeFile(artifactPath, JSON.stringify(artifact));

  const map = await loadVerifiedSourceExclusions(artifactPath, "2026-q3-de-01", f.batchRoot);
  expect(map?.size).toBe(2);
  expect(map?.get("city.stadtbranchenbuch.com/unrecognized.html")?.auditDisposition).toBe(
    "unrecognized",
  );
  expect(map?.has("city.stadtbranchenbuch.com/ok.html")).toBe(false);

  // Drift after artifact creation fails closed.
  await fs.appendFile(path.join(f.batchRoot, "city.stadtbranchenbuch.com/ok.html"), " ");
  await expect(
    loadVerifiedSourceExclusions(artifactPath, "2026-q3-de-01", f.batchRoot),
  ).rejects.toThrow("SOURCE_CLOSURE_CHANGED");
});
