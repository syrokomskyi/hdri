/*
<MODULE_CONTRACT>
<purpose>Independently inspect exact four-outcome availability JSON/CSV bytes for closed schema, small cells and cross-format disclosure.</purpose>
<non-goals><item>Does not authenticate measurements, inspect earlier releases, perform population inference or grant publication admission.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Add an independent byte-level review instead of trusting producer privacy flags.</item></CHANGE_SUMMARY>
*/
import { createHash } from "node:crypto";

const fields = ["period", "n", "reachable", "unavailable", "blocked", "indeterminate", "reachable_share_of_targets"];
const interpretation = [
  "Reachability follows the retained probe policy, not successful page delivery or quarter-long uptime.",
  "Blocked and indeterminate results are distinct from unavailable results and remain in the denominator.",
  "Describes measured targets only; no population, industry, business-closure or quarter-comparison inference.",
];
function closed(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key)))
    throw new Error("DISCLOSURE_UNDECLARED_OR_MISSING_FIELDS");
  return value as Record<string, unknown>;
}

export function reviewAvailabilityDisclosure(json: string, csv: string, period: string, effectiveK: number) {
  if (!/^\d{4}-q[1-4]$/.test(period) || !Number.isSafeInteger(effectiveK) || effectiveK < 1)
    throw new Error("DISCLOSURE_SCOPE_OR_POLICY_INVALID");
  const parsed: unknown = JSON.parse(json);
  // Reject duplicate-key/hidden textual payloads, not just JSON.parse's surviving values.
  if (json !== `${JSON.stringify(parsed, null, 2)}\n`) throw new Error("DISCLOSURE_NONCANONICAL_JSON");
  const product = closed(parsed, ["schema", "denominator", "outcome_policy", "interpretation", "rows"]);
  if (product.schema !== "hdri-public-availability@2" || product.denominator !== "sealed-liveness-targets" ||
    product.outcome_policy !== "availability-outcome-v1" ||
    JSON.stringify(product.interpretation) !== JSON.stringify(interpretation) ||
    !Array.isArray(product.rows) || product.rows.length !== 1)
    throw new Error("DISCLOSURE_PRODUCT_SCHEMA_MISMATCH");
  const row = closed(product.rows[0], fields);
  if (row.period !== period) throw new Error("DISCLOSURE_PERIOD_MISMATCH");
  const outcomes = [row.reachable, row.unavailable, row.blocked, row.indeterminate];
  if ([row.n, ...outcomes].some(value => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0))
    throw new Error("DISCLOSURE_COUNTS_INVALID");
  const counts = outcomes as number[];
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total !== row.n || total < effectiveK)
    throw new Error("DISCLOSURE_DENOMINATOR_INVALID");
  if (counts.some(value => value > 0 && value < effectiveK))
    throw new Error("DISCLOSURE_SMALL_CELL_REVEALED_BY_TOTAL");
  if (row.reachable_share_of_targets !== counts[0]! / total)
    throw new Error("DISCLOSURE_RATE_MISMATCH");
  const expectedCsv = `${fields.join(",")}\n${fields.map(field => row[field]).join(",")}\n`;
  if (csv !== expectedCsv) throw new Error("DISCLOSURE_CROSS_FORMAT_MISMATCH");
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  return {
    schema: "hdri-availability-disclosure@1", status: "single-product-checked-not-release-admission",
    period, effectiveK, filesChecked: 2, cellsChecked: 5,
    files: [{ name: "availability.json", sha256: hash(json), bytes: Buffer.byteLength(json) },
      { name: "availability.csv", sha256: hash(csv), bytes: Buffer.byteLength(csv) }],
    checks: ["closed-schema-no-site-identifiers", "fixed-interpretation", "complete-four-outcome-denominator",
      "all-nonzero-cells-at-least-k", "no-suppressed-cell-recovery-through-total", "exact-cross-format-equality"],
    limitations: ["Earlier releases and external auxiliary information are not inspected.",
      "Measurement authenticity and publication admission require separate evidence."],
  };
}
