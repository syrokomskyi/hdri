import { expect, it } from "vitest";
import fc from "fast-check";
import { parseImportedEvidenceDescriptor } from "../index.js";
import fixture from "./__fixtures__/imported-evidence.json";

const descriptor = fc
  .record({ bytes: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), suffix: fc.uuid() })
  .map(({ bytes, suffix }) => ({
    ...fixture,
    sourceRecords: [
      { artifact: { ...fixture.sourceRecords[0].artifact, bytes }, locator: `rows/${suffix}` },
    ],
    target: { ...fixture.target, recordId: suffix },
  }));

// Idempotency and round-trip: validation preserves exact accepted metadata, including UUID/time bytes.
it("validating and JSON round-tripping imported evidence is idempotent", () => {
  fc.assert(
    fc.property(descriptor, (input) => {
      const once = parseImportedEvidenceDescriptor(input);
      expect(parseImportedEvidenceDescriptor(once)).toEqual(input);
      expect(parseImportedEvidenceDescriptor(JSON.parse(JSON.stringify(once)))).toEqual(input);
    }),
    { numRuns: 200 },
  );
});

// Immutability: no caller-owned nested object/array survives in the accepted descriptor.
it("detaches and freezes every source reference while leaving caller input unchanged", () => {
  fc.assert(
    fc.property(descriptor, (input) => {
      const before = structuredClone(input);
      const parsed = parseImportedEvidenceDescriptor(input);
      expect(input).toEqual(before);
      input.sourceRecords[0].locator = "mutated";
      input.sourceRecords[0].artifact.bytes = 7;
      expect(parsed).toEqual(before);
      for (const value of [
        parsed,
        parsed.target,
        parsed.measurement,
        parsed.sourceManifest,
        parsed.sourceRecords,
        parsed.sourceRecords[0],
        parsed.sourceRecords[0].artifact,
      ])
        expect(Object.isFrozen(value)).toBe(true);
    }),
    { numRuns: 200 },
  );
});
