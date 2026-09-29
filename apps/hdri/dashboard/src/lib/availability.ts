/*
<MODULE_CONTRACT>
<purpose>Validate availability public manifest and exact JSON/CSV bytes before dashboard rendering.</purpose>
<non-goals><item>Does not grant publication admission or compare availability with historical scores.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Only four-outcome schema v2 is rendered; preview descriptors, private fields, hash mismatches and inconsistent denominators fail the build.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>RFC-0115: add manifest-bound availability consumption separate from score data.</item></CHANGE_SUMMARY>
*/
import { createHash } from "node:crypto";
import type { AvailabilityDownload, AvailabilityPeriod } from "../types";

const outcomes = ["reachable", "unavailable", "blocked", "indeterminate"] as const;
const fields = ["period", "n", ...outcomes, "reachable_share_of_targets"];
const interpretation = [
  "Reachability follows the retained probe policy, not successful page delivery or quarter-long uptime.",
  "Blocked and indeterminate results are distinct from unavailable results and remain in the denominator.",
  "Describes measured targets only; no population, industry, business-closure or quarter-comparison inference.",
];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AVAILABILITY_OBJECT_REQUIRED");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))
    throw new Error("AVAILABILITY_PUBLIC_FIELDS_INVALID");
}

/** The trusted exporter owns admission; this build-time check enforces delivered public bytes. */
export function readAvailabilityDownload(period: string, manifestText: string, json: string, csv: string): AvailabilityDownload {
  const manifest = object(JSON.parse(manifestText));
  if (!/^\d{4}-q[1-4]$/.test(period) || manifest.period !== period ||
    manifest.schema !== "hdri-public-manifest@1" ||
    (manifest.status !== undefined && manifest.status !== "published") ||
    !Number.isSafeInteger(manifest.kAnonymityMin) || (manifest.kAnonymityMin as number) < 1 ||
    typeof manifest.policyDigest !== "string" || !/^[a-f0-9]{64}$/.test(manifest.policyDigest) ||
    !Array.isArray(manifest.products) || manifest.products.length !== 2)
    throw new Error("AVAILABILITY_MANIFEST_INVALID");
  const k = manifest.kAnonymityMin as number;
  const formats = new Set<string>();
  for (const value of manifest.products) {
    const product = object(value);
    const format = product.format;
    if ((format !== "json" && format !== "csv") || formats.has(format) ||
      product.schema !== "hdri-public-product@1" || product.product !== "availability" ||
      product.schemaId !== "hdri-public-availability@2" || product.policySha256 !== manifest.policyDigest)
      throw new Error("AVAILABILITY_PRODUCT_INVALID");
    formats.add(format);
    const bytes = format === "json" ? json : csv;
    if (Buffer.byteLength(bytes) !== product.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== product.contentSha256)
      throw new Error("AVAILABILITY_PRODUCT_DIGEST_MISMATCH");
  }
  const document = object(JSON.parse(json));
  exactKeys(document, ["schema", "denominator", "outcome_policy", "interpretation", "rows"]);
  if (document.schema !== "hdri-public-availability@2" || document.denominator !== "sealed-liveness-targets" ||
    document.outcome_policy !== "availability-outcome-v1" ||
    JSON.stringify(document.interpretation) !== JSON.stringify(interpretation) ||
    !Array.isArray(document.rows) || document.rows.length !== 1)
    throw new Error("AVAILABILITY_SCHEMA_INVALID");
  const row = object(document.rows[0]);
  exactKeys(row, fields);
  const n = row.n;
  if (row.period !== period || typeof n !== "number" || !Number.isSafeInteger(n) || n < k)
    throw new Error("AVAILABILITY_DENOMINATOR_INVALID");
  let total = 0;
  for (const key of outcomes) {
    const value = row[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || (value > 0 && value < k))
      throw new Error("AVAILABILITY_OUTCOME_INVALID");
    total += value;
  }
  if (total !== n || row.reachable_share_of_targets !== (row.reachable as number) / n)
    throw new Error("AVAILABILITY_COUNTS_INVALID");
  if (csv !== `${fields.join(",")}\n${fields.map(key => row[key]).join(",")}\n`)
    throw new Error("AVAILABILITY_FORMATS_DISAGREE");
  return { row: row as AvailabilityPeriod, kAnonymityMin: k, json, csv };
}
