/*
<MODULE_CONTRACT>
  <purpose>Prepare private content-addressed JSON/CSV preview bytes from matching retained availability reports and an explicit policy.</purpose>
  <non-goals><item>Does not publish, grant admission, authenticate caller-supplied reports or issue a complete disclosure/recovery receipt.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Add reproducible preview preparation with report/policy byte bindings and atomic private output.</item></CHANGE_SUMMARY>
*/
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import { serializeReconciledAvailabilityPreview } from "../run/release/availability-preview";

const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
async function readAddressed(file: string) {
  const bytes = await fs.readFile(path.resolve(file));
  const sha256 = digest(bytes);
  if (path.basename(file) !== `${sha256}.json`) throw new Error("PREVIEW_INPUT_CONTENT_ADDRESS_MISMATCH");
  return { sha256, value: JSON.parse(bytes.toString("utf8")) as unknown };
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    candidate: { type: "string" }, reconciliation: { type: "string" }, policy: { type: "string" },
  } });
  if (!values.candidate || !values.reconciliation || !values.policy)
    throw new Error("EXPLICIT_CANDIDATE_RECONCILIATION_POLICY_REQUIRED");
  const [candidate, reconciliation, policyBytes] = await Promise.all([
    readAddressed(values.candidate), readAddressed(values.reconciliation), fs.readFile(path.resolve(values.policy)),
  ]);
  const policy = parse(policyBytes.toString("utf8"));
  if (!policy || !Number.isSafeInteger(policy.default_k) || policy.default_k < 1 ||
    !Number.isSafeInteger(policy.hard_floor) || policy.hard_floor < 1 ||
    typeof policy.high_risk_release !== "boolean") throw new Error("PREVIEW_POLICY_INVALID");
  const effectiveK = policy.high_risk_release ? policy.default_k : Math.max(policy.default_k, policy.hard_floor);
  const policySha256 = digest(policyBytes);
  const preview = serializeReconciledAvailabilityPreview(candidate.value, reconciliation.value, effectiveK, policySha256);
  const files = { "availability.json": preview.json, "availability.csv": preview.csv };
  const manifest = {
    schema: "hdri-availability-preview@1", status: preview.status, schemaId: preview.schemaId,
    candidateSha256: candidate.sha256, reconciliationSha256: reconciliation.sha256, policySha256, effectiveK,
    files: Object.entries(files).map(([name, bytes]) => ({ name, sha256: digest(bytes), bytes: Buffer.byteLength(bytes) })),
    limitations: ["Caller-selected report hashes establish byte identity, not trusted provenance or publication admission.",
      "Local small-cell checks are not complete disclosure review.", "CSV must retain its accompanying JSON interpretation and preview manifest."],
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const hash = digest(manifestBytes);
  const root = path.resolve(".output", "availability-previews");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const target = path.join(root, hash);
  const expectedFiles = { ...files, "preview-manifest.json": manifestBytes };
  try {
    const existing = await fs.readdir(target);
    if (existing.length !== Object.keys(expectedFiles).length) throw new Error("PREVIEW_OUTPUT_CONFLICT");
    for (const [name, bytes] of Object.entries(expectedFiles))
      if (await fs.readFile(path.join(target, name), "utf8") !== bytes) throw new Error("PREVIEW_OUTPUT_CONFLICT");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const temporary = await fs.mkdtemp(path.join(root, ".incomplete-"));
    for (const [name, bytes] of Object.entries(expectedFiles)) {
      const file = await fs.open(path.join(temporary, name), "wx", 0o600);
      try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    }
    const directory = await fs.open(temporary, "r");
    try { await directory.sync(); } finally { await directory.close(); }
    await fs.rename(temporary, target);
    const parent = await fs.open(root, "r");
    try { await parent.sync(); } finally { await parent.close(); }
  }
  process.stdout.write(`${JSON.stringify({ status: preview.status, outputDir: target, manifestSha256: hash })}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
