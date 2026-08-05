/*
<MODULE_CONTRACT>
<purpose>Defines and verifies the complete 16×7 Destatis population-frame contract used by HDRI releases.</purpose>
<non-goals><item>Does not download official statistics or infer missing cells.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0033: add source URL domain validation (genesis.destatis.de, statistikportal.de).</item>
  <item>RFC-0033: add reference year floor (>= 2020) validation.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type { PopulationFrame } from "./poststrat-core";

export const DESTATIS_BUNDESLAENDER = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
] as const;

export const DESTATIS_GROUPS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;
export const EXPECTED_DESTATIS_STRATA = DESTATIS_BUNDESLAENDER.length * DESTATIS_GROUPS.length;

const ALLOWED_SOURCE_DOMAINS = ["genesis.destatis.de", "statistikportal.de"] as const;

export type DestatisGroup = (typeof DESTATIS_GROUPS)[number];
export type DestatisBundesland = (typeof DESTATIS_BUNDESLAENDER)[number];

export type PopulationFrameManifest = Readonly<{
  schemaVersion: "1";
  frameVersion: string;
  statisticalUnit: "Handwerksunternehmen";
  handwerkScope: "Handwerk insgesamt";
  sourceAgency: "Statistisches Bundesamt (Destatis)";
  sourceTable: "53111-0011";
  referenceYear: number;
  retrievedAt: string;
  sourceUrl: string;
  sourceFileName: string;
  sourceFileSha256: string;
  parserVersion: string;
  strataSystem: "bundesland|destatis_group";
  expectedStrata: 112;
  weightsSha256: string;
  nationalTotal: number;
  bundeslandTotals: Readonly<Record<DestatisBundesland, number>>;
  groupTotals: Readonly<Record<DestatisGroup, number>>;
  notes: readonly string[];
}>;

export type ProvenancedPopulationFrame = PopulationFrame & {
  manifest: PopulationFrameManifest;
};

const sha256Pattern = /^[0-9a-f]{64}$/;

export const canonicalWeightsSha256 = (weights: Readonly<Record<string, number>>): string =>
  createHash("sha256")
    .update(JSON.stringify(Object.entries(weights).sort(([a], [b]) => a.localeCompare(b))))
    .digest("hex");

export const expectedPopulationFrameKeys = (): string[] =>
  DESTATIS_BUNDESLAENDER.flatMap((land) => DESTATIS_GROUPS.map((group) => `${land}|${group}`));

export const assertCompletePopulationFrame = (frame: ProvenancedPopulationFrame): void => {
  if (!frame || typeof frame !== "object" || !frame.manifest || !frame.weights) {
    throw new Error("Population frame manifest and weights are required");
  }
  const { manifest, weights } = frame;
  if (
    frame.strataSystem !== "bundesland|destatis_group" ||
    manifest.schemaVersion !== "1" ||
    manifest.statisticalUnit !== "Handwerksunternehmen" ||
    manifest.handwerkScope !== "Handwerk insgesamt" ||
    manifest.sourceAgency !== "Statistisches Bundesamt (Destatis)" ||
    manifest.sourceTable !== "53111-0011" ||
    manifest.expectedStrata !== EXPECTED_DESTATIS_STRATA
  ) {
    throw new Error(
      "Population frame manifest does not describe the canonical Destatis 53111-0011 frame",
    );
  }
  if (!ALLOWED_SOURCE_DOMAINS.some((d) => manifest.sourceUrl.includes(d))) {
    throw new Error(
      `Population frame sourceUrl must be from ${ALLOWED_SOURCE_DOMAINS.join(" or ")}, got: ${manifest.sourceUrl}`,
    );
  }
  if (!Number.isInteger(manifest.referenceYear) || manifest.referenceYear < 2020) {
    throw new Error(
      `Population frame referenceYear must be an integer >= 2020, got: ${manifest.referenceYear}`,
    );
  }
  if (!manifest.frameVersion.trim() || !manifest.parserVersion.trim()) {
    throw new Error("Population frame requires frameVersion and parserVersion");
  }
  if (!sha256Pattern.test(manifest.sourceFileSha256)) {
    throw new Error("Population frame sourceFileSha256 must be a SHA-256 hex digest");
  }
  if (!Number.isFinite(Date.parse(manifest.retrievedAt))) {
    throw new Error("Population frame retrieval timestamp is invalid");
  }
  const expectedKeys = expectedPopulationFrameKeys();
  const actualKeys = Object.keys(weights).sort();
  if (
    actualKeys.length !== EXPECTED_DESTATIS_STRATA ||
    actualKeys.join("\0") !== expectedKeys.sort().join("\0")
  ) {
    throw new Error("Population frame must contain exactly the canonical 16×7 cells");
  }
  for (const [key, value] of Object.entries(weights)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Population frame cell must be a non-negative integer: ${key}`);
    }
  }
  if (canonicalWeightsSha256(weights) !== manifest.weightsSha256) {
    throw new Error("Population frame weights hash mismatch");
  }
  const landTotals = Object.fromEntries(DESTATIS_BUNDESLAENDER.map((land) => [land, 0])) as Record<
    DestatisBundesland,
    number
  >;
  const groupTotals = Object.fromEntries(DESTATIS_GROUPS.map((group) => [group, 0])) as Record<
    DestatisGroup,
    number
  >;
  let nationalTotal = 0;
  for (const [key, value] of Object.entries(weights)) {
    const [land, group] = key.split("|") as [DestatisBundesland, DestatisGroup];
    landTotals[land] += value;
    groupTotals[group] += value;
    nationalTotal += value;
  }
  if (nationalTotal <= 0 || nationalTotal !== manifest.nationalTotal) {
    throw new Error("Population frame national total does not reconcile");
  }
  for (const land of DESTATIS_BUNDESLAENDER) {
    if (landTotals[land] !== manifest.bundeslandTotals[land]) {
      throw new Error(`Population frame Bundesland total does not reconcile: ${land}`);
    }
  }
  for (const group of DESTATIS_GROUPS) {
    if (groupTotals[group] !== manifest.groupTotals[group]) {
      throw new Error(`Population frame group total does not reconcile: ${group}`);
    }
  }
};
