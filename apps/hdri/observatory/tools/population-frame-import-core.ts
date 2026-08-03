/*
<MODULE_CONTRACT>
<purpose>Validates an official Destatis 53111-0011 company-count extract and builds HDRI frame weights.</purpose>
<non-goals><item>Does not accept employment, revenue, mixed units, or fabricate missing cells.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0029 adds provenance-locked population-frame import.</item></CHANGE_SUMMARY>
*/

import {
  DESTATIS_BUNDESLAENDER,
  DESTATIS_GROUPS,
  EXPECTED_DESTATIS_STRATA,
  assertCompletePopulationFrame,
  canonicalWeightsSha256,
  type DestatisBundesland,
  type DestatisGroup,
  type ProvenancedPopulationFrame,
} from "./population-frame-contract";
import { parse } from "csv-parse/sync";

export const DESTATIS_FRAME_PARSER_VERSION = "destatis-53111-0011-csv-v1";

export type DestatisFrameMetadata = Readonly<{
  sourceAgency: "Statistisches Bundesamt (Destatis)";
  tableCode: "53111-0011";
  statisticalUnit: "Handwerksunternehmen";
  handwerkScope: "Handwerk insgesamt";
  referenceYear: number;
  retrievedAt: string;
  sourceUrl: string;
  sourceFileName: string;
  sourceFileSha256: string;
  parserVersion: string;
  frameVersion: string;
  notes: readonly string[];
}>;

export type DestatisFrameCell = Readonly<{
  bundesland: DestatisBundesland;
  destatisGroup: DestatisGroup;
  companies: number;
}>;

export type DestatisFrameSource = DestatisFrameMetadata & Readonly<{
  rows: readonly Readonly<{
    bundesland: DestatisBundesland;
    destatisGroup: DestatisGroup;
    companies: number;
  }>[];
}>;

export const importDestatisPopulationFrame = (
  source: DestatisFrameSource,
): ProvenancedPopulationFrame => {
  if (source.tableCode !== "53111-0011") throw new Error("Population frame must use Destatis table 53111-0011");
  if (source.statisticalUnit !== "Handwerksunternehmen") {
    throw new Error("Population frame weights must be company counts, not persons or revenue");
  }
  if (source.handwerkScope !== "Handwerk insgesamt") {
    throw new Error("Population frame must use Handwerk insgesamt");
  }
  if (!/^https:\/\/(www\.)?(genesis\.destatis\.de|statistikportal\.de)\//.test(source.sourceUrl)) {
    throw new Error("Population frame sourceUrl must identify an official Destatis/Statistikportal source");
  }
  if (!Number.isInteger(source.referenceYear) || source.referenceYear < 2020) {
    throw new Error("Invalid population-frame reference year");
  }
  if (!Number.isFinite(Date.parse(source.retrievedAt))) throw new Error("Invalid retrieval timestamp");
  if (source.parserVersion !== DESTATIS_FRAME_PARSER_VERSION) {
    throw new Error(`Population frame parserVersion must be ${DESTATIS_FRAME_PARSER_VERSION}`);
  }
  if (source.rows.length !== EXPECTED_DESTATIS_STRATA) {
    throw new Error(`Population frame requires ${EXPECTED_DESTATIS_STRATA} cells`);
  }

  const weights: Record<string, number> = {};
  const lands = new Set<string>(DESTATIS_BUNDESLAENDER);
  const groups = new Set<string>(DESTATIS_GROUPS);
  for (const row of source.rows) {
    if (!lands.has(row.bundesland) || !groups.has(row.destatisGroup)) {
      throw new Error("Invalid population-frame stratum");
    }
    if (!Number.isSafeInteger(row.companies) || row.companies < 0) {
      throw new Error("Company counts must be non-negative integers");
    }
    const key = `${row.bundesland}|${row.destatisGroup}`;
    if (key in weights) throw new Error(`Duplicate population-frame stratum: ${key}`);
    weights[key] = row.companies;
  }
  const frame: ProvenancedPopulationFrame = {
    strataSystem: "bundesland|destatis_group",
    source: `Destatis GENESIS ${source.tableCode}, Handwerksunternehmen, ${source.referenceYear}`,
    weights,
    manifest: {
      schemaVersion: "1",
      frameVersion: source.frameVersion,
      sourceAgency: source.sourceAgency,
      sourceTable: source.tableCode,
      statisticalUnit: source.statisticalUnit,
      handwerkScope: source.handwerkScope,
      referenceYear: source.referenceYear,
      retrievedAt: source.retrievedAt,
      sourceUrl: source.sourceUrl,
      sourceFileName: source.sourceFileName,
      sourceFileSha256: source.sourceFileSha256,
      parserVersion: source.parserVersion,
      strataSystem: "bundesland|destatis_group",
      expectedStrata: 112,
      weightsSha256: canonicalWeightsSha256(weights),
      nationalTotal: Object.values(weights).reduce((sum, value) => sum + value, 0),
      bundeslandTotals: Object.fromEntries(
        DESTATIS_BUNDESLAENDER.map((land) => [
          land,
          DESTATIS_GROUPS.reduce((sum, group) => sum + weights[`${land}|${group}`]!, 0),
        ]),
      ) as Record<DestatisBundesland, number>,
      groupTotals: Object.fromEntries(
        DESTATIS_GROUPS.map((group) => [
          group,
          DESTATIS_BUNDESLAENDER.reduce((sum, land) => sum + weights[`${land}|${group}`]!, 0),
        ]),
      ) as Record<DestatisGroup, number>,
      notes: source.notes,
    },
  };
  assertCompletePopulationFrame(frame);
  return frame;
};

const normalized = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9äöü]+/g, " ")
    .trim();

const landByNormalized = new Map(
  DESTATIS_BUNDESLAENDER.map((land) => [normalized(land), land] as const),
);
const groupLabels: Readonly<Record<DestatisGroup, string>> = {
  I: "Bauhauptgewerbe",
  II: "Ausbaugewerbe",
  III: "Handwerke für den gewerblichen Bedarf",
  IV: "Kraftfahrzeuggewerbe",
  V: "Lebensmittelgewerbe",
  VI: "Gesundheitsgewerbe",
  VII: "Handwerke für den privaten Bedarf",
};

const parseLand = (value: string): DestatisBundesland | null => {
  const withoutCode = normalized(value).replace(/^\d+\s+/, "");
  return landByNormalized.get(withoutCode) ?? null;
};

const parseGroup = (value: string): DestatisGroup | null => {
  const text = normalized(value);
  const code = /(?:gewgr\s*)0?([1-7])(?:\s|$)/.exec(text)?.[1];
  if (code) return DESTATIS_GROUPS[Number(code) - 1]!;
  for (const group of DESTATIS_GROUPS) {
    if (text === normalized(groupLabels[group])) return group;
  }
  return null;
};

const parseCompanyCount = (value: string): number | null => {
  const compact = value.trim().replace(/[.\s\u00a0]/g, "");
  if (!/^\d+$/.test(compact)) return null;
  const count = Number(compact);
  return Number.isSafeInteger(count) ? count : null;
};

const isLandHeader = (cell: string): boolean =>
  cell.includes("bundesland") || cell.includes("bundesländer");

export const parseDestatisPopulationFrameCsv = (
  csvText: string,
  metadata: DestatisFrameMetadata,
): DestatisFrameSource => {
  if (!csvText.includes("53111-0011")) {
    throw new Error("Official export does not identify Destatis table 53111-0011");
  }
  const table = parse(csvText, {
    bom: true,
    delimiter: ";",
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
  }) as string[][];
  const headerIndex = table.findIndex((row) => {
    const cells = row.map(normalized);
    const indexes = [
      cells.findIndex((cell) => cell === "jahr"),
      cells.findIndex(isLandHeader),
      cells.findIndex((cell) => cell.includes("handwerksart")),
      cells.findIndex((cell) => cell.includes("gewerbegruppe") || cell.includes("gewerbezweig")),
      cells.findIndex((cell) => cell === "handwerksunternehmen"),
    ];
    return indexes.every((index) => index >= 0) && new Set(indexes).size === indexes.length;
  });
  if (headerIndex < 0) {
    throw new Error("Official export lacks the required GENESIS dimension headers");
  }
  const header = table[headerIndex]!.map(normalized);
  const yearIndex = header.findIndex((cell) => cell === "jahr");
  const landIndex = header.findIndex(isLandHeader);
  const scopeIndex = header.findIndex((cell) => cell.includes("handwerksart"));
  const groupIndex = header.findIndex(
    (cell) => cell.includes("gewerbegruppe") || cell.includes("gewerbezweig"),
  );
  const valueIndex = header.findIndex((cell) => cell === "handwerksunternehmen");
  let currentYear = "";
  let currentLand = "";
  let currentScope = "";
  const rows: DestatisFrameCell[] = [];
  for (const record of table.slice(headerIndex + 1)) {
    if (record[yearIndex]?.trim()) currentYear = record[yearIndex]!.trim();
    if (record[landIndex]?.trim()) currentLand = record[landIndex]!.trim();
    if (record[scopeIndex]?.trim()) currentScope = record[scopeIndex]!.trim();
    if (Number(currentYear) !== metadata.referenceYear) continue;
    if (normalized(currentScope) !== normalized(metadata.handwerkScope)) continue;
    const bundesland = parseLand(currentLand);
    const destatisGroup = parseGroup(record[groupIndex] ?? "");
    if (!bundesland || !destatisGroup) continue;
    const companies = parseCompanyCount(record[valueIndex] ?? "");
    if (companies == null) {
      throw new Error(`Missing/non-integer Handwerksunternehmen count for ${bundesland}|${destatisGroup}`);
    }
    rows.push({ bundesland, destatisGroup, companies });
  }
  if (rows.length !== EXPECTED_DESTATIS_STRATA) {
    throw new Error(
      `Official export yielded ${rows.length} canonical cells; expected ${EXPECTED_DESTATIS_STRATA}`,
    );
  }
  return { ...metadata, rows };
};
