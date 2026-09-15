import { expect, test } from "vitest";
import fc from "fast-check";
import { compareMethodologySnapshots } from "../score/methodology-comparison";

// Equality of complete component digests is symmetric and independent of JSON key order.
test("methodology content comparison is symmetric under arbitrary complete identities", () => {
  const digest = fc
    .array(fc.constantFrom(..."0123456789abcdef"), { minLength: 64, maxLength: 64 })
    .map((chars) => chars.join(""));
  const identity = fc.record({
    codebookSha256: digest,
    ontologySha256: digest,
    scoringSemanticsSha256: digest,
    signalMapSha256: digest,
    missingnessPolicySha256: digest,
    classificationPolicySha256: digest,
    populationPolicySha256: digest,
    suppressionPolicySha256: digest,
  });
  fc.assert(
    fc.property(identity, identity, (a, b) => {
      expect(compareMethodologySnapshots(a, b).scoreComparable).toBe(
        compareMethodologySnapshots(b, a).scoreComparable,
      );
      expect(
        compareMethodologySnapshots(a, Object.fromEntries(Object.entries(a).reverse()))
          .scoreComparable,
      ).toBe(true);
    }),
  );
});
