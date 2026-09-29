/*
<MODULE_CONTRACT>
<purpose>Read exact private preview files and retain a content-addressed byte-level disclosure review bound to the policy.</purpose>
<non-goals><item>Does not publish, authenticate scientific measurements, inspect prior releases or grant admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Add an executable independent JSON/CSV disclosure check for the availability preview.</item></CHANGE_SUMMARY>
*/
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import { reviewAvailabilityDisclosure } from "../run/release/availability-disclosure";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    "preview-dir": { type: "string" }, period: { type: "string" }, policy: { type: "string" },
  } });
  if (!values["preview-dir"] || !values.period || !values.policy)
    throw new Error("EXPLICIT_PREVIEW_PERIOD_POLICY_REQUIRED");
  const dir = await fs.realpath(values["preview-dir"]);
  const names = (await fs.readdir(dir)).sort();
  if (JSON.stringify(names) !== JSON.stringify(["availability.csv", "availability.json", "preview-manifest.json"]))
    throw new Error("DISCLOSURE_UNDECLARED_PREVIEW_FILES");
  const manifestBytes = await fs.readFile(path.join(dir, "preview-manifest.json"));
  const manifestSha256 = hash(manifestBytes);
  if (path.basename(dir) !== manifestSha256) throw new Error("DISCLOSURE_PREVIEW_MANIFEST_ADDRESS_MISMATCH");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.schema !== "hdri-availability-preview@1" || manifest.status !== "preview-not-approved" ||
    manifest.schemaId !== "hdri-public-availability@2") throw new Error("DISCLOSURE_MANIFEST_SCHEMA_MISMATCH");
  const policyBytes = await fs.readFile(path.resolve(values.policy));
  const policy = parse(policyBytes.toString("utf8"));
  if (!policy || !Number.isSafeInteger(policy.default_k) || policy.default_k < 1 ||
    !Number.isSafeInteger(policy.hard_floor) || policy.hard_floor < 1 || typeof policy.high_risk_release !== "boolean")
    throw new Error("DISCLOSURE_POLICY_INVALID");
  const effectiveK = policy.high_risk_release ? policy.default_k : Math.max(policy.default_k, policy.hard_floor);
  if (manifest.policySha256 !== hash(policyBytes) || manifest.effectiveK !== effectiveK)
    throw new Error("DISCLOSURE_POLICY_BINDING_MISMATCH");
  const json = await fs.readFile(path.join(dir, "availability.json"), "utf8");
  const csv = await fs.readFile(path.join(dir, "availability.csv"), "utf8");
  const review = reviewAvailabilityDisclosure(json, csv, values.period, effectiveK);
  if (JSON.stringify(manifest.files) !== JSON.stringify(review.files))
    throw new Error("DISCLOSURE_FILE_HASH_OR_SIZE_MISMATCH");
  const bytes = `${JSON.stringify({ ...review, previewManifestSha256: manifestSha256, policySha256: hash(policyBytes) }, null, 2)}\n`;
  const digest = hash(bytes);
  const root = path.resolve(".output", "availability-disclosure", manifestSha256);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = path.join(root, `.${randomUUID()}.tmp`);
  const target = path.join(root, `${digest}.json`);
  const handle = await fs.open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try {
    try { await fs.link(temporary, target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await fs.readFile(target, "utf8") !== bytes) throw new Error("DISCLOSURE_OUTPUT_CONFLICT");
    }
  } finally { await fs.unlink(temporary); }
  const directory = await fs.open(root, "r");
  try { await directory.sync(); } finally { await directory.close(); }
  process.stdout.write(`${JSON.stringify({ status: review.status, reportPath: target, sha256: digest })}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
