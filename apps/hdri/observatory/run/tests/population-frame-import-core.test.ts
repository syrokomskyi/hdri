import { describe, expect, it } from "vitest";
import { importDestatisPopulationFrame, type DestatisFrameSource } from "../../tools/population-frame-import-core";

const source = (): DestatisFrameSource => ({
  sourceAgency: "Statistisches Bundesamt (Destatis)",
  tableCode: "53111-0011",
  statisticalUnit: "Handwerksunternehmen",
  referenceYear: 2024,
  retrievedAt: "2026-08-02T00:00:00.000Z",
  sourceUrl: "https://genesis.destatis.de/datenbank/online/table/53111-0011",
  rows: [{ bundesland: "Bayern", destatisGroup: "I", companies: 100 }],
});

describe("Destatis population-frame importer", () => {
  it("preserves official provenance and company-count weights", () => {
    const frame = importDestatisPopulationFrame(source());
    expect(frame.weights).toEqual({ "Bayern|I": 100 });
    expect(frame.provenance.statisticalUnit).toBe("Handwerksunternehmen");
  });

  it("rejects mixed statistical units and duplicate cells", () => {
    expect(() => importDestatisPopulationFrame({ ...source(), statisticalUnit: "Tätige Personen" as never })).toThrow(/company counts/);
    expect(() => importDestatisPopulationFrame({ ...source(), rows: [...source().rows, ...source().rows] })).toThrow(/Duplicate/);
  });
});
