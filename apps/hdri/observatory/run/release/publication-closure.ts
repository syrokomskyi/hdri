/*
<MODULE_CONTRACT>
<purpose>Verify public manifest and product bytes against the capsule publication inventory and retained product scope.</purpose>
<non-goals><item>Does not replace scientific reports, capsule signature verification or operational publication admission.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Every public file, including the manifest, must have an exact capsule inventory binding and belong to the retained product scope.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: reject excluded products and undeclared publication artifacts before archival or public writes.</item><item>RFC-0115: bind the explicit availability-only capsule profile to one retained product scope and a neutral quarter-bound v2 JSON/CSV descriptor.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { readRetainedPublicationScope } from "./publication-scope";
import { sha256File } from "./release-contract";

export async function verifyPublicationClosure(capsuleDir: string, capsule: Pick<QuarterCapsule, "period" | "capsuleId" | "artifacts" | "releaseProfile">, manifestPath: string) {
  const requested = await readRetainedPublicationScope(capsuleDir, capsule);
  if (capsule.releaseProfile === "availability-only@1" &&
    (requested.length !== 1 || requested[0] !== "availability"))
    throw new Error("AVAILABILITY_RELEASE_SCOPE_MISMATCH");
  const bytes = await fs.readFile(manifestPath);
  if (bytes.length > 1024 * 1024) throw new Error("PUBLIC_MANIFEST_TOO_LARGE");
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (capsule.releaseProfile === "availability-only@1" &&
    (manifest.period !== capsule.period || manifest.capsuleId !== capsule.capsuleId ||
      manifest.status !== undefined || !Array.isArray(manifest.products) || manifest.products.length !== 2 ||
      manifest.products.some((entry: { product?: string; schemaId?: string }) =>
        entry?.product !== "availability" || entry?.schemaId !== "hdri-public-availability@2")))
    throw new Error("AVAILABILITY_RELEASE_MANIFEST_MISMATCH");
  if (manifest.schema !== "hdri-public-manifest@1" || !Array.isArray(manifest.products) || !manifest.products.length ||
    !Number.isSafeInteger(manifest.kAnonymityMin) || manifest.kAnonymityMin < 1 ||
    typeof manifest.policyDigest !== "string" || !/^[a-f0-9]{64}$/.test(manifest.policyDigest))
    throw new Error("PUBLIC_MANIFEST_CONTRACT_INVALID");
  const publications = capsule.artifacts.filter(artifact => artifact.stage === "publication");
  const expected = new Map<string, { sha256: string; bytes: number }>([["artifacts/publication/public-manifest.json", {
    sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length,
  }]]);
  for (const entry of manifest.products) {
    if (!entry || entry.schema !== "hdri-public-product@1" ||
      (!requested.includes(entry.product) && entry.product !== "methodology") ||
      !["csv", "json"].includes(entry.format) || typeof entry.schemaId !== "string" || !entry.schemaId ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.policySha256 !== manifest.policyDigest ||
      [entry.contentSha256, entry.sourceAggregateSha256].some(digest => typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)))
      throw new Error("PUBLIC_PRODUCT_SCOPE_OR_CONTRACT_INVALID");
    const uri = `artifacts/publication/${entry.product}.${entry.format}`;
    if (expected.has(uri)) throw new Error("PUBLIC_PRODUCT_DUPLICATE");
    expected.set(uri, { sha256: entry.contentSha256, bytes: entry.bytes });
  }
  if (!manifest.products.some((entry: { product: string }) => requested.includes(entry.product as typeof requested[number])))
    throw new Error("PUBLIC_MANIFEST_NO_REQUESTED_PRODUCT");
  if (publications.length !== expected.size || new Set(publications.map(artifact => artifact.uri)).size !== publications.length)
    throw new Error("PUBLICATION_INVENTORY_NOT_EXACT");
  for (const artifact of publications) {
    const pinned = expected.get(artifact.uri);
    if (!pinned || pinned.sha256 !== artifact.sha256 || pinned.bytes !== artifact.bytes)
      throw new Error("PUBLICATION_INVENTORY_BINDING_MISMATCH");
    const file = path.join(capsuleDir, artifact.uri);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size !== pinned.bytes || await sha256File(file) !== pinned.sha256)
      throw new Error("PUBLICATION_BYTES_MISMATCH");
  }
  return { requestedProducts: requested, publicManifestSha256: createHash("sha256").update(bytes).digest("hex"), files: expected.size };
}
