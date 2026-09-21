import { describe, expect, it } from "vitest";
import {
  evaluateKeyTrust,
  findTrustedKey,
  parseTrustedKeysManifest,
  type TrustedKeyEntry,
  type TrustedKeysManifest,
} from "../key-registry.js";

const entry = (over: Partial<TrustedKeyEntry> = {}): TrustedKeyEntry => ({
  signingKeyId: "dev-abc123",
  deviceId: "dev",
  pemFile: "dev.pem",
  sha256: "abc",
  status: "active",
  validFrom: "2026-01-01T00:00:00Z",
  validUntil: null,
  ...over,
});

const manifest = (keys: TrustedKeyEntry[]): TrustedKeysManifest => ({
  kind: "observatory-trusted-keys",
  schemaVersion: 1,
  updatedAt: "2026-07-01T00:00:00Z",
  keys,
});

describe("evaluateKeyTrust", () => {
  it("trusts an active key for a signature inside its window", () => {
    const t = evaluateKeyTrust(entry(), "2026-05-27T00:00:00Z");
    expect(t.trusted).toBe(true);
  });

  it("distrusts a signing_key_id with no manifest entry", () => {
    expect(evaluateKeyTrust(undefined, "2026-05-27T00:00:00Z").trusted).toBe(false);
  });

  it("distrusts a revoked key even inside its window", () => {
    const t = evaluateKeyTrust(
      entry({ status: "revoked", note: "laptop stolen" }),
      "2026-05-27T00:00:00Z",
    );
    expect(t.trusted).toBe(false);
    expect(t.reason).toContain("revoked");
  });

  it("still trusts a RETIRED key for its historical signatures", () => {
    // Retired at mid-year, but a signature from before retirement must still verify.
    const t = evaluateKeyTrust(
      entry({ status: "retired", validUntil: "2026-06-30T23:59:59Z" }),
      "2026-05-27T00:00:00Z",
    );
    expect(t.trusted).toBe(true);
  });

  it("distrusts a signature before validFrom or after validUntil", () => {
    const e = entry({ validFrom: "2026-04-01T00:00:00Z", validUntil: "2026-06-30T00:00:00Z" });
    expect(evaluateKeyTrust(e, "2026-03-01T00:00:00Z").trusted).toBe(false); // too early
    expect(evaluateKeyTrust(e, "2026-07-01T00:00:00Z").trusted).toBe(false); // too late
    expect(evaluateKeyTrust(e, "2026-05-01T00:00:00Z").trusted).toBe(true); // inside
  });

  it("distrusts an unparseable signed_at", () => {
    expect(evaluateKeyTrust(entry(), "not-a-date").trusted).toBe(false);
  });
});

describe("parseTrustedKeysManifest / findTrustedKey", () => {
  it("accepts a valid manifest and finds a key by id", () => {
    const m = parseTrustedKeysManifest(manifest([entry({ signingKeyId: "dev-xyz" })]));
    expect(findTrustedKey(m, "dev-xyz")?.deviceId).toBe("dev");
    expect(findTrustedKey(m, "missing")).toBeUndefined();
  });

  it("rejects a non-manifest and an unknown status", () => {
    expect(() => parseTrustedKeysManifest({ kind: "nope" })).toThrow();
    expect(() =>
      parseTrustedKeysManifest(manifest([entry({ status: "bogus" as unknown as "active" })])),
    ).toThrow(/unknown status/);
  });
});
