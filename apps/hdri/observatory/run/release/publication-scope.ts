/*
<MODULE_CONTRACT>
<purpose>Read publication-scope intent only when retained and byte-bound in the current capsule methodology closure.</purpose>
<non-goals><item>Does not grant admission or infer exclusions from missing reports or public product files.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Missing retained intent keeps every scientific product in scope; mutable input files cannot remove gates.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: bind product-scoped scientific requirements to retained operator intent without weakening default requirements.</item></CHANGE_SUMMARY>
*/
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";
import { SCIENTIFIC_PRODUCTS, requiredScientificReports, type ScientificProduct } from "./release-contract";

export const PUBLICATION_SCOPE_URI = "artifacts/methodology/publication-scope.yaml";
export async function readRetainedPublicationScope(capsuleDir: string, capsule: Pick<QuarterCapsule, "period" | "capsuleId" | "artifacts">): Promise<readonly ScientificProduct[]> {
  const entries = capsule.artifacts.filter(entry => entry.uri === PUBLICATION_SCOPE_URI);
  if (entries.length === 0) return SCIENTIFIC_PRODUCTS;
  const artifact = entries[0]!;
  if (entries.length !== 1 || artifact.stage !== "methodology" || artifact.bytes > 1024 * 1024)
    throw new Error("PUBLICATION_SCOPE_ARTIFACT_INVALID");
  const handle = await fs.open(path.join(capsuleDir, PUBLICATION_SCOPE_URI), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== artifact.bytes) throw new Error("PUBLICATION_SCOPE_ARTIFACT_INVALID");
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
    throw new Error("PUBLICATION_SCOPE_DIGEST_MISMATCH");
  return parsePublicationScopeIntent(bytes.toString("utf8"), capsule);
}

/** Validates intent only; release gate selection must use readRetainedPublicationScope. */
export function parsePublicationScopeIntent(text: string, capsule: Pick<QuarterCapsule, "period" | "capsuleId">): readonly ScientificProduct[] {
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("PUBLICATION_SCOPE_ARTIFACT_INVALID");
  const scope = parse(text);
  const fields = ["schema", "period", "capsuleId", "requestedProducts", "excludedProducts", "claims", "nonClaims", "authority", "releaseAuthority"];
  if (!scope || typeof scope !== "object" || Object.keys(scope).length !== fields.length ||
    Object.keys(scope).some(key => !fields.includes(key)) || scope.schema !== "hdri-publication-intent@1" ||
    scope.period !== capsule.period || scope.capsuleId !== capsule.capsuleId ||
    !Array.isArray(scope.requestedProducts) || !Array.isArray(scope.excludedProducts) ||
    ![scope.claims, scope.nonClaims].every(value => Array.isArray(value) && value.every(item => typeof item === "string" && item.trim())) ||
    typeof scope.authority !== "string" || !scope.authority.trim() ||
    scope.releaseAuthority !== "none; all applicable scientific, privacy and custody gates remain required")
    throw new Error("PUBLICATION_SCOPE_CONTRACT_MISMATCH");
  requiredScientificReports(scope.requestedProducts);
  const union = [...scope.requestedProducts, ...scope.excludedProducts];
  if (union.length !== SCIENTIFIC_PRODUCTS.length || new Set(union).size !== union.length ||
    union.some(product => !SCIENTIFIC_PRODUCTS.includes(product))) throw new Error("PUBLICATION_SCOPE_PARTITION_INVALID");
  return Object.freeze([...scope.requestedProducts]) as readonly ScientificProduct[];
}
