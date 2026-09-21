import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { deriveAssetId, derivePublicAssetId, newId } from "../ids.js";

describe("newId — property-based", () => {
  it("always produces a valid UUID v4 format", () => {
    fc.assert(
      fc.property(fc.nat(100), () => {
        expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      }),
    );
  });

  it("generates unique IDs across many calls", () => {
    fc.assert(
      fc.property(fc.nat({ min: 10, max: 200 }), (count) => {
        const ids = new Set(Array.from({ length: count }, () => newId()));
        expect(ids.size).toBe(count);
      }),
    );
  });
});

describe("deriveAssetId — property-based", () => {
  it("is deterministic: same domain always yields same asset_id", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (domain) => {
        expect(deriveAssetId(domain)).toBe(deriveAssetId(domain));
      }),
    );
  });

  it("always matches the da- prefix + 32 hex chars format", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (domain) => {
        expect(deriveAssetId(domain)).toMatch(/^da-[0-9a-f]{32}$/);
      }),
    );
  });

  it("is injective: different domains yield different asset_ids", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (a, b) => {
        fc.pre(a !== b);
        expect(deriveAssetId(a)).not.toBe(deriveAssetId(b));
      }),
    );
  });
});

describe("derivePublicAssetId — property-based", () => {
  it("is deterministic for the same inputs", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (assetId, salt) => {
        expect(derivePublicAssetId(assetId, salt)).toBe(derivePublicAssetId(assetId, salt));
      }),
    );
  });

  it("always matches the pub_ prefix + 16 hex chars format", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (assetId, salt) => {
        expect(derivePublicAssetId(assetId, salt)).toMatch(/^pub_[0-9a-f]{16}$/);
      }),
    );
  });

  it("differs for different salts (same asset_id)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (assetId, salt1, salt2) => {
          fc.pre(salt1 !== salt2);
          expect(derivePublicAssetId(assetId, salt1)).not.toBe(derivePublicAssetId(assetId, salt2));
        },
      ),
    );
  });

  it("differs for different asset_ids (same salt)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (assetId1, assetId2, salt) => {
          fc.pre(assetId1 !== assetId2);
          expect(derivePublicAssetId(assetId1, salt)).not.toBe(derivePublicAssetId(assetId2, salt));
        },
      ),
    );
  });
});
