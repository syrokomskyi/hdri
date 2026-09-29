/*
<MODULE_CONTRACT>
<purpose>Decode a dashboard-cross-section product into quarterly dashboard payloads without rescoring or opening historical databases.</purpose>
<non-goals><item>Does not authenticate a release, grant publication admission, write public files or compute comparisons.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Closed aggregate fields and exact sample accounting prevent private columns or incomplete maturity bands from reaching the renderer.</item></KEY_DECISIONS>
<CHANGE_SUMMARY><item>Unified HDRI: consume the prepared cross-section representation without rebuilding Q2.</item></CHANGE_SUMMARY>
*/
import type { OverviewExport, DimensionExport, SliceExport, MatrixExport } from "./archive-export-types";

export type DashboardPayloads = {
  overview: OverviewExport;
  dimensions: DimensionExport[];
  bundeslaender: SliceExport[];
  gewerke: SliceExport[];
  matrix: MatrixExport[];
};
const summary = ["n", "mean", "p10", "p25", "p50", "p75", "p90", "min", "max", "stdDev"];
const fields: Record<string, string[]> = {
  overview: summary, confidence: summary,
  maturity: ["id", "label", "n", "share"],
  dimension: ["id", "label", "weight", ...summary],
  bundesland: ["id", "label", ...summary], gewerk: ["id", "label", ...summary],
  matrix: ["bundesland", "gewerk", "n", "mean", "p10", "p25", "p50", "p75", "p90"],
};

/** Structural decoding is not evidence of publication authority. */
export function decodeDashboardCrossSection(json: string, k: number): DashboardPayloads {
  if (!Number.isSafeInteger(k) || k < 1) throw new Error("CROSS_SECTION_K_INVALID");
  if (Buffer.byteLength(json) > 8 * 1024 * 1024) throw new Error("CROSS_SECTION_TOO_LARGE");
  const input: unknown = JSON.parse(json);
  if (!Array.isArray(input) || !input.length || input.length > 10000)
    throw new Error("CROSS_SECTION_ROWS_INVALID");
  const groups: Record<string, Record<string, string | number>[]> = Object.fromEntries(
    Object.keys(fields).map(section => [section, []]),
  );
  const keys = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CROSS_SECTION_ROW_INVALID");
    const row = value as Record<string, unknown>;
    const section = row.section;
    if (typeof section !== "string" || !Object.hasOwn(fields, section)) throw new Error("CROSS_SECTION_SECTION_INVALID");
    const expected = fields[section]!;
    if (Object.keys(row).length !== expected.length + 1 || expected.some(key => !Object.hasOwn(row, key)))
      throw new Error("CROSS_SECTION_FIELDS_INVALID");
    const payload: Record<string, string | number> = {};
    for (const key of expected) {
      const cell = row[key];
      if (["id", "label", "bundesland", "gewerk"].includes(key)) {
        if (typeof cell !== "string" || !cell.trim() || cell.length > 256) throw new Error("CROSS_SECTION_LABEL_INVALID");
      } else if (typeof cell !== "number" || !Number.isFinite(cell) || cell < 0 ||
        (key !== "n" && cell > (["share", "weight"].includes(key) || section === "confidence" ? 1 : 100))) {
        throw new Error("CROSS_SECTION_NUMBER_INVALID");
      }
      payload[key] = cell as string | number;
    }
    if (!Number.isSafeInteger(payload.n) || Number(payload.n) < k) throw new Error("CROSS_SECTION_SMALL_CELL");
    const identity = JSON.stringify([section, payload.id ?? null, payload.bundesland ?? null, payload.gewerk ?? null]);
    if (keys.has(identity)) throw new Error("CROSS_SECTION_DUPLICATE");
    keys.add(identity);
    const quantiles = ["min", "p10", "p25", "p50", "p75", "p90", "max"].filter(key => key in payload);
    if (quantiles.some((key, index) => index > 0 && Number(payload[key]) < Number(payload[quantiles[index - 1]!])))
      throw new Error("CROSS_SECTION_QUANTILES_INVALID");
    groups[section]!.push(payload);
  }
  if (groups.overview!.length !== 1 || groups.confidence!.length !== 1 || !groups.maturity!.length)
    throw new Error("CROSS_SECTION_INCOMPLETE");
  const n = Number(groups.overview![0]!.n);
  if (groups.confidence![0]!.n !== n || input.some(row => row.n > n) ||
    groups.maturity!.reduce((sum, row) => sum + Number(row.n), 0) !== n ||
    groups.maturity!.some(row => Math.abs(Number(row.share) - Number(row.n) / n) > 1e-12))
    throw new Error("CROSS_SECTION_SAMPLE_MISMATCH");
  // Every field was checked above; projection preserves the released aggregates exactly.
  return {
    overview: {
      sampleSize: n,
      summary: groups.overview![0] as OverviewExport["summary"],
      confidence: groups.confidence![0] as OverviewExport["confidence"],
      maturity: groups.maturity!.map(row => ({ id: String(row.id), label: String(row.label), count: Number(row.n), share: Number(row.share) })),
    },
    dimensions: groups.dimension! as DimensionExport[],
    bundeslaender: groups.bundesland! as SliceExport[],
    gewerke: groups.gewerk! as SliceExport[],
    matrix: groups.matrix! as MatrixExport[],
  };
}
