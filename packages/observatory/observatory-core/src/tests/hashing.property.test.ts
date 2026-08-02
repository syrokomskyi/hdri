import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { computationHash, sha256, sha256Json } from "../hashing.js";

describe("sha256 — property-based", () => {
  it("is deterministic: same input always yields same hash", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(sha256(s)).toBe(sha256(s));
      }),
    );
  });

  it("produces a 64-char hex string for any input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(sha256(s)).toMatch(/^[0-9a-f]{64}$/);
      }),
    );
  });
});

describe("sha256Json — property-based", () => {
  it("is deterministic regardless of key insertion order", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string().filter((s) => s !== "__proto__"),
          fc.jsonValue(),
        ),
        (obj) => {
          const reversed = Object.fromEntries(Object.entries(obj).reverse());
          expect(sha256Json(obj)).toBe(sha256Json(reversed));
        },
      ),
    );
  });

  it("is deterministic for any JSON-serialisable value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        expect(sha256Json(v)).toBe(sha256Json(v));
      }),
    );
  });

  it("produces a 64-char hex string for any JSON value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        expect(sha256Json(v)).toMatch(/^[0-9a-f]{64}$/);
      }),
    );
  });

  it("is invariant under key reordering in nested objects", { timeout: 15_000 }, () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string().filter((s) => s !== "__proto__"),
          fc.dictionary(
            fc.string().filter((s) => s !== "__proto__"),
            fc.jsonValue(),
          ),
        ),
        (obj) => {
          const shuffled = Object.fromEntries(
            Object.entries(obj).map(([k, inner]) => [
              k,
              Object.fromEntries(Object.entries(inner).reverse()),
            ]),
          );
          expect(sha256Json(obj)).toBe(sha256Json(shuffled));
        },
      ),
    );
  });

  it("differs when array order changes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.jsonValue()).filter((arr) => arr.length >= 2),
        (arr) => {
          const reversed = [...arr].reverse();
          fc.pre(JSON.stringify(arr) !== JSON.stringify(reversed));
          expect(sha256Json(arr)).not.toBe(sha256Json(reversed));
        },
      ),
    );
  });
});

describe("computationHash — property-based", () => {
  it("is invariant under permutation of observation IDs", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.uuid().map((u) => `obs-${u}`),
          { minLength: 1, maxLength: 20 },
        ),
        fc.string({ minLength: 1 }),
        (ids, version) => {
          const shuffled = [...ids].sort(() => Math.random() - 0.5);
          expect(computationHash(version, ids)).toBe(computationHash(version, shuffled));
        },
      ),
    );
  });

  it("differs for different codebook versions (same IDs)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (ids, v1, v2) => {
          fc.pre(v1 !== v2);
          expect(computationHash(v1, ids)).not.toBe(computationHash(v2, ids));
        },
      ),
    );
  });

  it("produces a 64-char hex string", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.string(), { maxLength: 5 }),
        (version, ids) => {
          expect(computationHash(version, ids)).toMatch(/^[0-9a-f]{64}$/);
        },
      ),
    );
  });
});
