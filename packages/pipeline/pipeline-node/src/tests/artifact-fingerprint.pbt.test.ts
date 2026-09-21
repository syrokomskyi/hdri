import fc from "fast-check";
import { expect, test } from "vitest";

import { digestValue } from "../index.js";

test("canonical value digests are invariant under object key insertion order", () => {
  // Canonical-map property: insertion order is not semantic, so all permutations share a digest.
  fc.assert(
    fc.property(fc.uniqueArray(fc.tuple(fc.string({ minLength: 1 }), fc.integer()), { selector: ([key]) => key }), (entries) => {
      const forward = Object.fromEntries(entries);
      const reverse = Object.fromEntries([...entries].reverse());
      expect(digestValue(forward)).toEqual(digestValue(reverse));
    }),
  );
});

test("changing a scalar dependency changes its digest", () => {
  // Sensitivity property: distinct scalar values must not retain the same dependency fingerprint.
  fc.assert(
    fc.property(fc.string(), fc.string(), (left, right) => {
      fc.pre(left !== right);
      expect(digestValue(left).sha256).not.toBe(digestValue(right).sha256);
    }),
  );
});

test("canonicalization is deterministic for every supported JSON value", () => {
  // Determinism property: repeated evaluation of the same value is byte-for-byte stable.
  fc.assert(
    fc.property(fc.jsonValue(), (value) => {
      expect(digestValue(value)).toEqual(digestValue(value));
    }),
  );
});
