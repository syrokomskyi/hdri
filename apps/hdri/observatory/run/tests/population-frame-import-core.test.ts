import { describe, expect, it } from "vitest";
import {
  DESTATIS_FRAME_PARSER_VERSION,
  importDestatisPopulationFrame,
  parseDestatisPopulationFrameCsv,
  type DestatisFrameMetadata,
  type DestatisFrameSource,
} from "../../tools/population-frame-import-core";
import { DESTATIS_BUNDESLAENDER, DESTATIS_GROUPS } from "../../tools/population-frame-contract";

const source = (): DestatisFrameSource => {
  const rows = DESTATIS_BUNDESLAENDER.flatMap((bundesland) =>
    DESTATIS_GROUPS.map((destatisGroup, index) => ({
      bundesland,
      destatisGroup,
      companies: index + 1,
    })),
  );
  return {
    sourceAgency: "Statistisches Bundesamt (Destatis)",
    tableCode: "53111-0011",
    statisticalUnit: "Handwerksunternehmen",
    handwerkScope: "Handwerk insgesamt",
    referenceYear: 2024,
    retrievedAt: "2026-08-02T00:00:00.000Z",
    sourceUrl: "https://genesis.destatis.de/datenbank/online/table/53111-0011",
    sourceFileName: "53111-0011.csv",
    sourceFileSha256: "a".repeat(64),
    parserVersion: DESTATIS_FRAME_PARSER_VERSION,
    frameVersion: "destatis-53111-2024-v1",
    notes: [],
    rows,
  };
};

const csvFor = (metadata: DestatisFrameMetadata): string => {
  const groupLabels = [
    "Bauhauptgewerbe",
    "Ausbaugewerbe",
    "Handwerke für den gewerblichen Bedarf",
    "Kraftfahrzeuggewerbe",
    "Lebensmittelgewerbe",
    "Gesundheitsgewerbe",
    "Handwerke für den privaten Bedarf",
  ];
  return [
    "Tabelle;53111-0011;;;",
    "Jahr;Bundesländer;Handwerksarten;Gewerbegruppen und Gewerbezweige;Handwerksunternehmen",
    ...DESTATIS_BUNDESLAENDER.flatMap((land) =>
      DESTATIS_GROUPS.map(
        (_group, index) =>
          `${metadata.referenceYear};${land};${metadata.handwerkScope};GEWGR-0${index + 1} ${groupLabels[index]};${index + 1}`,
      ),
    ),
  ].join("\n");
};

describe("Destatis population-frame importer", () => {
  it("preserves official provenance and company-count weights", () => {
    const frame = importDestatisPopulationFrame(source());
    expect(Object.keys(frame.weights)).toHaveLength(112);
    expect(frame.weights["Bayern|I"]).toBe(1);
    expect(frame.manifest.statisticalUnit).toBe("Handwerksunternehmen");
  });

  it("derives all 112 weights from the preserved official CSV rather than metadata rows", () => {
    const { rows: _rows, ...metadata } = source();
    const parsed = parseDestatisPopulationFrameCsv(csvFor(metadata), metadata);
    const frame = importDestatisPopulationFrame(parsed);
    expect(parsed.rows).toHaveLength(112);
    expect(frame.manifest.nationalTotal).toBe(16 * 28);
    expect(frame.manifest.bundeslandTotals.Bayern).toBe(28);
  });

  it("rejects mixed statistical units and duplicate cells", () => {
    expect(() => importDestatisPopulationFrame({ ...source(), statisticalUnit: "Tätige Personen" as never })).toThrow(/company counts/);
    expect(() => importDestatisPopulationFrame({ ...source(), rows: source().rows.slice(1) })).toThrow(/112 cells/);
  });

  it("rejects arbitrary Länder and official exports with incomplete cells", () => {
    const invalidLand = source().rows.map((row, index) => index === 0 ? { ...row, bundesland: "Atlantis" as never } : row);
    expect(() => importDestatisPopulationFrame({ ...source(), rows: invalidLand })).toThrow(/Invalid population-frame stratum/);
    const { rows: _rows, ...metadata } = source();
    expect(() =>
      parseDestatisPopulationFrameCsv(csvFor(metadata).replace(/2024;Thüringen;[^\n]+\n?$/, ""), metadata),
    ).toThrow(/expected 112/);
  });
});
