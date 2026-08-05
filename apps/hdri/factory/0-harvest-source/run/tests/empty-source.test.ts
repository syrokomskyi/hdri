import { describe, it, expect } from "vitest";
import { parseStandardizedCsv } from "../parsers/csv-shared.js";

describe("parseStandardizedCsv — empty source handling", () => {
  it("returns empty items and warning for a completely empty CSV", () => {
    const result = parseStandardizedCsv("", "test");
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual(["Empty CSV file"]);
  });

  it("returns empty items for a CSV with only headers (no data rows)", () => {
    const csv = "Name,Straße,PLZ,Stadt,Telefon,Email,Website,Branche,Profil_URL,Seite\n";
    const result = parseStandardizedCsv(csv, "test");
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual(["Empty CSV file"]);
  });

  it("returns empty items when all rows are missing website URL", () => {
    const csv = [
      "Name,Straße,PLZ,Stadt,Telefon,Email,Website,Branche,Profil_URL,Seite",
      "Test GmbH,Teststr. 1,10115,Berlin,,,,,,",
      "Foo AG,Muster 2,20095,Hamburg,,,,,,",
    ].join("\n");
    const result = parseStandardizedCsv(csv, "test");
    expect(result.items).toEqual([]);
    expect(result.warnings.length).toBe(2);
    expect(result.warnings[0]).toContain("no website URL");
    expect(result.warnings[1]).toContain("no website URL");
  });
});
