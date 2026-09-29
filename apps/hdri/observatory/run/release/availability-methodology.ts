/*
<MODULE_CONTRACT>
<purpose>Verify the retained availability-methodology runtime inventory against an explicit manifest pin and policy.</purpose>
<non-goals><item>Does not execute replay, authenticate manifest authority, certify container isolation or grant publication admission.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Methodology identity comes from exact retained source, bundles, image and policy bytes, not excluded score/classification components.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: provide a byte-verified availability-only methodology closure.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const REQUIRED = [
  "policies/k-anon-policy-v1.yaml", "runtime/build-metafile.json", "runtime/node24-alpine-image.tar",
  "runtime/prepare-availability.mjs", "runtime/reconcile-availability.mjs",
  "runtime/prepare-availability-preview.mjs", "runtime/review-availability-preview.mjs",
  "source/apps/hdri/observatory/run/release/availability-candidate.ts",
  "source/apps/hdri/observatory/run/release/availability-reconciliation.ts",
  "source/apps/hdri/observatory/run/release/availability-preview.ts",
  "source/apps/hdri/observatory/run/release/availability-disclosure.ts",
  "source/packages/observatory/observatory-core/src/availability.ts",
] as const;
const HASH = /^[a-f0-9]{64}$/;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function verifyAvailabilityMethodology(options: {
  manifestPath: string; expectedManifestSha256: string; policySha256: string;
  period: string; capsuleId: string;
}) {
  if (!HASH.test(options.expectedManifestSha256) || !HASH.test(options.policySha256))
    throw new Error("METHODOLOGY_EXPLICIT_DIGEST_REQUIRED");
  const manifestPath = path.resolve(options.manifestPath);
  const root = await fs.realpath(path.dirname(manifestPath));
  if (await fs.realpath(manifestPath) !== manifestPath) throw new Error("METHODOLOGY_MANIFEST_SYMLINK");
  const handle = await fs.open(manifestPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error("METHODOLOGY_MANIFEST_INVALID");
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  if (hash(bytes) !== options.expectedManifestSha256) throw new Error("METHODOLOGY_MANIFEST_DIGEST_MISMATCH");
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.schema !== "hdri-offline-runtime-kit@1" || manifest.period !== options.period ||
    manifest.capsuleId !== options.capsuleId || typeof manifest.image !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(manifest.image) || !Array.isArray(manifest.files) ||
    manifest.files.length === 0 || manifest.files.length > 10000)
    throw new Error("METHODOLOGY_RUNTIME_SCOPE_INVALID");
  const files = new Map<string, { bytes: number; sha256: string }>();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== "string" || entry.path.length > 4096 ||
      entry.path.includes("\\") || entry.path.split("/").some((part: string) => !part || part === "." || part === "..") ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== "string" ||
      !HASH.test(entry.sha256) || files.has(entry.path)) throw new Error("METHODOLOGY_INVENTORY_INVALID");
    files.set(entry.path, { bytes: entry.bytes, sha256: entry.sha256 });
  }
  if (REQUIRED.some(name => !files.has(name) || files.get(name)!.bytes === 0)) throw new Error("METHODOLOGY_COMPONENT_MISSING");
  if (files.get("policies/k-anon-policy-v1.yaml")!.sha256 !== options.policySha256)
    throw new Error("METHODOLOGY_POLICY_MISMATCH");
  let totalBytes = 0;
  for (const [name, expected] of files) {
    const file = path.join(root, name);
    if (await fs.realpath(file) !== file) throw new Error("METHODOLOGY_INVENTORY_SYMLINK");
    const source = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const before = await source.stat();
      if (!before.isFile() || before.size !== expected.bytes) throw new Error("METHODOLOGY_COMPONENT_SIZE_MISMATCH");
      const digest = createHash("sha256");
      for await (const chunk of source.createReadStream({ autoClose: false })) digest.update(chunk);
      const after = await source.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
        digest.digest("hex") !== expected.sha256) throw new Error("METHODOLOGY_COMPONENT_DIGEST_MISMATCH");
      totalBytes += expected.bytes;
      if (!Number.isSafeInteger(totalBytes)) throw new Error("METHODOLOGY_INVENTORY_SIZE_INVALID");
    } finally { await source.close(); }
  }
  if (hash(await fs.readFile(manifestPath)) !== options.expectedManifestSha256)
    throw new Error("METHODOLOGY_MANIFEST_CHANGED");
  return {
    evidenceSchema: "hdri-availability-methodology@1" as const,
    applicability: ["availability"] as const,
    runtimeManifestSha256: options.expectedManifestSha256, policySha256: options.policySha256,
    declaredImageId: manifest.image as string, filesVerified: files.size, bytesVerified: totalBytes,
    components: REQUIRED.map(name => ({ path: name, ...files.get(name)! })),
  };
}
