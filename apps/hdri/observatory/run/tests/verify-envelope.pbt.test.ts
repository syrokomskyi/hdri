import { expect, it } from "vitest";
import fc from "fast-check";
import { hasConsistentObservationEnvelope } from "../verify/verify-core.js";

const envelope = fc.record({
  signature: fc.string(),
  signed_at: fc.string(),
  signing_key_id: fc.string(),
  collector_id: fc.string(),
});
it("envelope agreement is invariant under unrelated payload fields and never mutates inputs", () => {
  // Adding unrelated retained fields cannot change equality of ID and signing metadata.
  fc.assert(
    fc.property(fc.uuid(), envelope, fc.jsonValue(), (id, metadata, extra) => {
      const row = Object.freeze({ id, ...metadata });
      const payload = Object.freeze({ observation_id: id, ...metadata, extra });
      expect(hasConsistentObservationEnvelope(row, payload)).toBe(true);
      expect(hasConsistentObservationEnvelope(row, { observation_id: id })).toBe(true);
      expect(hasConsistentObservationEnvelope(row, { ...payload, observation_id: id + "x" })).toBe(
        false,
      );
      for (const field of ["signature", "signed_at", "signing_key_id", "collector_id"] as const) {
        expect(
          hasConsistentObservationEnvelope(row, { ...payload, [field]: metadata[field] + "x" }),
        ).toBe(false);
      }
    }),
    { numRuns: 200 },
  );
});
