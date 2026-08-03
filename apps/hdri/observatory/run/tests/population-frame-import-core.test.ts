import { describe, expect, it } from "vitest";
import {
  DESTATIS_FRAME_PARSER_VERSION,
  importDestatisPopulationFrame,
  parseDestatisPopulationFrameCsv,
  type DestatisFrameMetadata,
  type DestatisFrameSource,
} from "../../tools/population-frame-import-core";
import {
  assertCompletePopulationFrame,
  DESTATIS_BUNDESLAENDER,
  DESTATIS_GROUPS,
  canonicalWeightsSha256,
  type ProvenancedPopulationFrame,
} from "../../tools/population-frame-contract";

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
    expect(() =>
      importDestatisPopulationFrame({ ...source(), statisticalUnit: "Tätige Personen" as never }),
    ).toThrow(/company counts/);
  });
});

const validFrame = (overrides?: {
  sourceUrl?: string;
  referenceYear?: number;
}): ProvenancedPopulationFrame => {
  const weights: Record<string, number> = {};
  for (const land of DESTATIS_BUNDESLAENDER) {
    for (const group of DESTATIS_GROUPS) {
      weights[`${land}|${group}`] = 1;
    }
  }
  const bundeslandTotals = Object.fromEntries(
    DESTATIS_BUNDESLAENDER.map((land) => [land, 7]),
  ) as Record<(typeof DESTATIS_BUNDESLAENDER)[number], number>;
  const groupTotals = Object.fromEntries(DESTATIS_GROUPS.map((group) => [group, 16])) as Record<
    (typeof DESTATIS_GROUPS)[number],
    number
  >;
  return {
    strataSystem: "bundesland|destatis_group",
    source: "test",
    weights,
    manifest: {
      schemaVersion: "1",
      frameVersion: "destatis-53111-2024-v1",
      statisticalUnit: "Handwerksunternehmen",
      handwerkScope: "Handwerk insgesamt",
      sourceAgency: "Statistisches Bundesamt (Destatis)",
      sourceTable: "53111-0011",
      referenceYear: overrides?.referenceYear ?? 2024,
      retrievedAt: "2026-08-02T00:00:00.000Z",
      sourceUrl:
        overrides?.sourceUrl ?? "https://genesis.destatis.de/datenbank/online/table/53111-0011",
      sourceFileName: "53111-0011.csv",
      sourceFileSha256: "a".repeat(64),
      parserVersion: DESTATIS_FRAME_PARSER_VERSION,
      strataSystem: "bundesland|destatis_group",
      expectedStrata: 112,
      weightsSha256: canonicalWeightsSha256(weights),
      nationalTotal: 112,
      bundeslandTotals,
      groupTotals,
      notes: [],
    },
  };
};

describe("assertCompletePopulationFrame provenance checks (RFC-0033)", () => {
  it("accepts sourceUrl from genesis.destatis.de", () => {
    expect(() => assertCompletePopulationFrame(validFrame())).not.toThrow();
  });

  it("accepts sourceUrl from statistikportal.de", () => {
    expect(() =>
      assertCompletePopulationFrame(
        validFrame({ sourceUrl: "https://statistikportal.de/download/53111-0011.csv" }),
      ),
    ).not.toThrow();
  });

  it("rejects sourceUrl from a non-Destatis domain", () => {
    expect(() =>
      assertCompletePopulationFrame(validFrame({ sourceUrl: "https://example.com/data.csv" })),
    ).toThrow(/sourceUrl must be from/);
  });

  it("rejects an empty sourceUrl", () => {
    expect(() => assertCompletePopulationFrame(validFrame({ sourceUrl: "" }))).toThrow(
      /sourceUrl must be from/,
    );
  });

  it("accepts referenceYear 2020 (floor)", () => {
    expect(() => assertCompletePopulationFrame(validFrame({ referenceYear: 2020 }))).not.toThrow();
  });

  it("rejects referenceYear 2019 (below floor)", () => {
    expect(() => assertCompletePopulationFrame(validFrame({ referenceYear: 2019 }))).toThrow(
      /referenceYear must be an integer >= 2020/,
    );
  });

  it("rejects referenceYear 0 (placeholder)", () => {
    expect(() => assertCompletePopulationFrame(validFrame({ referenceYear: 0 }))).toThrow(
      /referenceYear must be an integer >= 2020/,
    );
  });

  it("rejects non-integer referenceYear", () => {
    expect(() => assertCompletePopulationFrame(validFrame({ referenceYear: 2024.5 }))).toThrow(
      /referenceYear must be an integer >= 2020/,
    );
  });
});
