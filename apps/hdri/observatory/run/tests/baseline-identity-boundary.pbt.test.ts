import fc from "fast-check";
import { expect, it } from "vitest";
import {
  assertBaselineCanonicalId,
  parseBaselineIdentities,
} from "../../tools/preservation/contracts.js";
import { resolveIdentities } from "../../tools/preservation/baseline-import.js";

const sha256 = fc
  .array(fc.constantFrom(..."0123456789abcdef"), { minLength: 64, maxLength: 64 })
  .map((chars) => chars.join(""));
const scope = fc.record({ producer: fc.uuid(), device: fc.uuid(), databaseSha256: sha256 });
const row = fc.record({
  ...{ producer: fc.uuid(), device: fc.uuid(), databaseSha256: sha256 },
  localSiteId: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
  provisionalId: fc.uuid(),
  canonicalId: fc.uuid({ version: 7 }),
  evidenceRefs: fc.uuid().map((id) => [`originals/${id}`]),
});

// Case invariance: syntax validation accepts both hex cases but never normalizes retained IDs.
it("canonical validation preserves case and rejects any appended identity suffix", () => {
  fc.assert(
    fc.property(fc.uuid({ version: 7 }), (uuid) => {
      for (const value of [uuid, uuid.toUpperCase()]) {
        expect(() => assertBaselineCanonicalId(value)).not.toThrow();
        expect(
          parseBaselineIdentities([
            {
              producer: "p",
              device: "d",
              databaseSha256: "a".repeat(64),
              localSiteId: 1,
              provisionalId: "alias",
              canonicalId: value,
              evidenceRefs: ["originals/source"],
            },
          ])[0].canonicalId,
        ).toBe(value);
        for (const suffix of ["x", "\n", "\r", "\r\n", "\u2028", "\u2029"])
          expect(() => assertBaselineCanonicalId(value + suffix)).toThrow("canonicalId");
      }
    }),
    { numRuns: 200 },
  );
});

// Idempotency: validated identity input already has its one closed canonical shape.
it("identity parsing is idempotent and does not mutate its input", () => {
  fc.assert(
    fc.property(row, (input) => {
      const before = structuredClone(input);
      const parsed = parseBaselineIdentities([input]);
      expect(parseBaselineIdentities(parsed)).toEqual(parsed);
      expect(input).toEqual(before);
    }),
  );
});

// Invariance: changing scope does not change a retained UUID or collide with the original tuple.
it("identity scope preserves UUIDs across arbitrary producer, device and database tuples", () => {
  fc.assert(
    fc.property(row, scope, (input, otherScope) => {
      fc.pre(
        input.producer !== otherScope.producer ||
          input.device !== otherScope.device ||
          input.databaseSha256 !== otherScope.databaseSha256,
      );
      expect(parseBaselineIdentities([input, { ...input, ...otherScope }])).toEqual([
        input,
        { ...input, ...otherScope },
      ]);
    }),
    { numRuns: 300 },
  );
});

// Invariance and immutability: resolution carries retained UUIDs and refs without editing either input.
it("resolution preserves each retained canonical binding exactly", () => {
  fc.assert(
    fc.property(row, (input) => {
      const canonical = new Map([[input.provisionalId, input.canonicalId]]);
      const localIds = [
        {
          localSiteId: input.localSiteId,
          provisionalId: input.provisionalId,
          evidenceRefs: [...input.evidenceRefs],
        },
      ];
      const before = structuredClone(localIds);
      expect(
        resolveIdentities({
          producer: input.producer,
          device: input.device,
          databaseSha256: input.databaseSha256,
          localIds,
          existingCanonicalIds: canonical,
        }),
      ).toEqual([input]);
      expect(localIds).toEqual(before);
      expect([...canonical]).toEqual([[input.provisionalId, input.canonicalId]]);
    }),
  );
});
