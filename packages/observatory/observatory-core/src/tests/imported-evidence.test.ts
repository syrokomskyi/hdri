import { describe, expect, it } from "vitest";
import { parseImportedEvidenceDescriptor, parseImportedEvidenceIfClaimed } from "../index.js";
import fixture from "./__fixtures__/imported-evidence.json";

describe("generic imported-evidence quality", () => {
  it("rejects noncanonical digests, invalid asset IDs and oversized time/locator metadata", () => {
    for (const input of [
      { ...fixture, target: { ...fixture.target, assetId: "local-site-7" } },
      { ...fixture, target: { ...fixture.target, sha256: "C".repeat(64) } },
      {
        ...fixture,
        sourceManifest: { ...fixture.sourceManifest, sha256: { toString: () => "a".repeat(64) } },
      },
      { ...fixture, importedAt: `2026-09-14T10:00:00.${"0".repeat(65)}Z` },
      { ...fixture, sourceRecords: [{ ...fixture.sourceRecords[0], locator: "x".repeat(4097) }] },
    ])
      expect(() => parseImportedEvidenceDescriptor(input)).toThrow();
  });
  it("preserves known measurement time, offset and canonical UUID bytes separately from import time", () => {
    const parsed = parseImportedEvidenceDescriptor(fixture);
    expect(parsed).toEqual(fixture);
    expect(parsed.measurement.measuredAt).toBe("2026-05-18T21:42:29+02:00");
    expect(parsed.importedAt).toBe("2026-09-14T10:00:00.000Z");
    expect(parsed.target.assetId).toBe("0198F000-0000-7000-8000-000000000001");
  });

  it.each(["time-unknown", "not-observed"])(
    "retains explicit %s without inventing an Observation",
    (status) => {
      const input = {
        ...fixture,
        target: { ...fixture.target, kind: "retained-record" },
        measurement: { status, measuredAt: null, reason: "source did not record this fact" },
      };
      expect(parseImportedEvidenceDescriptor(input)).toEqual(input);
      expect(() => parseImportedEvidenceDescriptor({ ...input, target: fixture.target })).toThrow(
        /retained-record/,
      );
    },
  );

  it.each([null, undefined, [], false, "converted-evidence", 1])(
    "rejects non-descriptor input %s",
    (value) => {
      expect(() => parseImportedEvidenceDescriptor(value)).toThrow();
    },
  );

  it.each([
    "schema",
    "origin",
    "importedAt",
    "sourceManifest",
    "sourceRecords",
    "target",
    "measurement",
  ])("requires %s", (key) => {
    const input: Record<string, unknown> = { ...fixture };
    delete input[key];
    expect(() => parseImportedEvidenceDescriptor(input)).toThrow();
  });

  it.each([
    { ...fixture, liveSeal: "invented" },
    { ...fixture, schema: "observatory-imported-evidence@2" },
    { ...fixture, origin: "live-collection" },
    { ...fixture, sourceManifest: { ...fixture.sourceManifest, trusted: true } },
    { ...fixture, target: { ...fixture.target, extra: true } },
    { ...fixture, sourceRecords: [{ ...fixture.sourceRecords[0], sql: "SELECT 1" }] },
    { ...fixture, measurement: { ...fixture.measurement, quality: "complete" } },
  ])("rejects alternate versions and undeclared fields %#", (input) => {
    expect(() => parseImportedEvidenceDescriptor(input)).toThrow();
  });

  it.each(["../escape", "/absolute", "a/../b", "a//b", "a\\b", "file:relative", "a\0b"])(
    "rejects unsafe source reference %s",
    (uri) => {
      expect(() =>
        parseImportedEvidenceDescriptor({
          ...fixture,
          sourceManifest: { ...fixture.sourceManifest, uri },
        }),
      ).toThrow();
    },
  );

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "2048"])(
    "rejects invalid byte count %s",
    (bytes) => {
      expect(() =>
        parseImportedEvidenceDescriptor({
          ...fixture,
          sourceManifest: { ...fixture.sourceManifest, bytes },
        }),
      ).toThrow();
    },
  );

  it.each(["", "2026-02-30T00:00:00Z", "2026-05-18", "2026-05-18T00:00:00", null])(
    "rejects invalid observed time %s",
    (measuredAt) => {
      expect(() =>
        parseImportedEvidenceDescriptor({
          ...fixture,
          measurement: { status: "observed", measuredAt },
        }),
      ).toThrow();
    },
  );

  it("rejects fabricated times on unknown/not-observed states and missing reasons", () => {
    for (const status of ["time-unknown", "not-observed"]) {
      for (const measurement of [
        { status, measuredAt: fixture.importedAt, reason: "unknown" },
        { status, measuredAt: null },
      ])
        expect(() =>
          parseImportedEvidenceDescriptor({
            ...fixture,
            target: { ...fixture.target, kind: "retained-record" },
            measurement,
          }),
        ).toThrow();
    }
  });

  it("requires bounded nonempty source records and rejects duplicate locators or conflicting byte identities", () => {
    const first = fixture.sourceRecords[0];
    for (const sourceRecords of [
      [],
      Array(65).fill(first),
      [first, first],
      [first, { ...first, locator: "another row", artifact: { ...first.artifact, bytes: 1 } }],
      [{ ...first, artifact: { ...first.artifact, uri: fixture.sourceManifest.uri } }],
    ])
      expect(() => parseImportedEvidenceDescriptor({ ...fixture, sourceRecords })).toThrow();
    expect(
      parseImportedEvidenceDescriptor({
        ...fixture,
        sourceRecords: [first, { ...first, locator: "another row" }],
      }).sourceRecords,
    ).toHaveLength(2);
  });

  it("validates imported claims on a mixed evidence channel without certifying other evidence", () => {
    const conflict = { evidenceType: "observation-conflict", loserObservationId: "o1" };
    expect(parseImportedEvidenceIfClaimed(conflict)).toBe(conflict);
    expect(parseImportedEvidenceIfClaimed(null)).toBeNull();
    expect(parseImportedEvidenceIfClaimed(fixture)).toEqual(fixture);
    for (const value of [
      { origin: "converted-evidence" },
      { schema: "observatory-imported-evidence@1" },
      { schema: "observatory-imported-evidence@2" },
    ])
      expect(() => parseImportedEvidenceIfClaimed(value)).toThrow();
  });
});
