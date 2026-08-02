/*
<MODULE_CONTRACT>
<purpose>Validates an official Destatis 53111-0011 company-count extract and builds HDRI frame weights.</purpose>
<non-goals><item>Does not accept employment, revenue, mixed units, or fabricate missing cells.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0029 adds provenance-locked population-frame import.</item></CHANGE_SUMMARY>
*/

import type { PopulationFrame } from "./poststrat-core";

export type DestatisFrameSource = Readonly<{
  sourceAgency: "Statistisches Bundesamt (Destatis)";
  tableCode: "53111-0011";
  statisticalUnit: "Handwerksunternehmen";
  referenceYear: number;
  retrievedAt: string;
  sourceUrl: string;
  rows: readonly Readonly<{
    bundesland: string;
    destatisGroup: "I" | "II" | "III" | "IV" | "V" | "VI" | "VII";
    companies: number;
  }>[];
}>;

export type ProvenancedPopulationFrame = PopulationFrame & {
  provenance: Omit<DestatisFrameSource, "rows">;
};

export const importDestatisPopulationFrame = (
  source: DestatisFrameSource,
): ProvenancedPopulationFrame => {
  if (source.tableCode !== "53111-0011") throw new Error("Population frame must use Destatis table 53111-0011");
  if (source.statisticalUnit !== "Handwerksunternehmen") {
    throw new Error("Population frame weights must be company counts, not persons or revenue");
  }
  if (!/^https:\/\/(www\.)?(genesis\.destatis\.de|statistikportal\.de)\//.test(source.sourceUrl)) {
    throw new Error("Population frame sourceUrl must identify an official Destatis/Statistikportal source");
  }
  if (!Number.isInteger(source.referenceYear) || source.referenceYear < 2020) {
    throw new Error("Invalid population-frame reference year");
  }
  if (!Number.isFinite(Date.parse(source.retrievedAt))) throw new Error("Invalid retrieval timestamp");

  const weights: Record<string, number> = {};
  for (const row of source.rows) {
    if (!row.bundesland.trim() || !/^(I|II|III|IV|V|VI|VII)$/.test(row.destatisGroup)) {
      throw new Error("Invalid population-frame stratum");
    }
    if (!Number.isSafeInteger(row.companies) || row.companies < 0) {
      throw new Error("Company counts must be non-negative integers");
    }
    const key = `${row.bundesland.trim()}|${row.destatisGroup}`;
    if (key in weights) throw new Error(`Duplicate population-frame stratum: ${key}`);
    weights[key] = row.companies;
  }
  return {
    strataSystem: "bundesland|destatis_group",
    source: `Destatis GENESIS ${source.tableCode}, Handwerksunternehmen, ${source.referenceYear}`,
    weights,
    provenance: {
      sourceAgency: source.sourceAgency,
      tableCode: source.tableCode,
      statisticalUnit: source.statisticalUnit,
      referenceYear: source.referenceYear,
      retrievedAt: source.retrievedAt,
      sourceUrl: source.sourceUrl,
    },
  };
};
