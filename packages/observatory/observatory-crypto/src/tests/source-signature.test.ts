import { describe, expect, it } from "vitest";
import { generateSigningKey } from "../sign.js";
import {
  parseSourceSignatureManifest,
  signSource,
  verifySourceSignature,
  type SourceSignatureManifest,
} from "../sign-source.js";

const key = {
  ...generateSigningKey(),
  signingKeyId: "collector-a-test-key",
  collectorId: "collector-a",
};
const create = () =>
  signSource({
    signingKey: key,
    sourceToken: "2026-q3-de-01",
    appId: "0-harvest-source",
    appVersion: "3.0.0",
    snapshot: {
      uri: "source-snapshot.sqlite",
      sha256: "a".repeat(64),
      bytes: 4096,
    },
    domainCounts: [
      { domain: "site_source_seeds", rows: 2 },
      { domain: "sites", rows: 1 },
    ],
    signedAt: "2026-09-16T09:00:00.000Z",
  });

describe("closed source generation signatures", () => {
  it("round-trips a closed canonical manifest with derived total rows", () => {
    const manifest = create();
    expect(manifest).toMatchObject({
      schema: "hdri-source-signature@2",
      digest_domain: "hdri-closed-sqlite-snapshot@1",
      device_id: "collector-a",
      rows_signed: 3,
    });
    expect(verifySourceSignature(manifest, key.publicKeyPem)).toBe(true);
    expect(parseSourceSignatureManifest(JSON.stringify(manifest))).toEqual(manifest);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.snapshot)).toBe(true);
    expect(Object.isFrozen(manifest.domain_counts)).toBe(true);
  });

  it.each([
    ["device", (m: SourceSignatureManifest) => ({ ...m, device_id: "collector-b" })],
    ["token", (m: SourceSignatureManifest) => ({ ...m, source_token: "2026-q4-de-01" })],
    ["application", (m: SourceSignatureManifest) => ({ ...m, app_id: "other-app" })],
    ["version", (m: SourceSignatureManifest) => ({ ...m, app_version: "3.0.1" })],
    [
      "snapshot hash",
      (m: SourceSignatureManifest) => ({
        ...m,
        snapshot: { ...m.snapshot, sha256: "b".repeat(64) },
      }),
    ],
    [
      "domain count",
      (m: SourceSignatureManifest) => ({
        ...m,
        domain_counts: [{ domain: "site_source_seeds", rows: 3 }, m.domain_counts[1]!],
        rows_signed: 4,
      }),
    ],
    ["total rows", (m: SourceSignatureManifest) => ({ ...m, rows_signed: 4 })],
    ["time", (m: SourceSignatureManifest) => ({ ...m, signed_at: "2026-09-16T10:00:00.000Z" })],
  ])("detects tampering with signed %s", (_name, mutate) => {
    expect(
      verifySourceSignature(mutate(create()) as SourceSignatureManifest, key.publicKeyPem),
    ).toBe(false);
  });

  it("rejects duplicate fields, unsorted domains and inconsistent totals", () => {
    const manifest = create();
    const json = JSON.stringify(manifest);
    expect(() =>
      parseSourceSignatureManifest(json.replace('{"schema":', '{"schema":"duplicate","schema":')),
    ).toThrow("INVALID_SOURCE_SIGNATURE_JSON");
    expect(() =>
      parseSourceSignatureManifest(
        JSON.stringify({ ...manifest, domain_counts: [...manifest.domain_counts].reverse() }),
      ),
    ).toThrow("INVALID_SOURCE_SIGNATURE_DOMAIN_ORDER");
    expect(() =>
      parseSourceSignatureManifest(JSON.stringify({ ...manifest, rows_signed: 99 })),
    ).toThrow("SOURCE_SIGNATURE_ROW_COUNT_MISMATCH");
  });
});
