import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSigningKey, signObservation } from "@syrokomskyi/observatory-crypto";
import type {
  SigningKeyConfig,
  TrustedKeysManifest,
  VerificationKey,
} from "@syrokomskyi/observatory-crypto";
import type { Observation } from "@syrokomskyi/observatory-core";
import { verifySignedRows, type SignedRow } from "../verify/verify-core";

// A minimal signable observation (the crypto layer is structural — it signs whatever fields
// are present, so a full Observation is not needed to exercise verify).
const baseObs = (id: string): Observation =>
  ({
    observation_id: id,
    asset_id: "da-x",
    signal_path: "web.presence",
    value_bool: true,
  }) as unknown as Observation;

function makeKey(deviceId: string): { config: SigningKeyConfig; vk: VerificationKey } {
  const { privateKeyPem, publicKeyPem } = generateSigningKey();
  const fingerprint = crypto.createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 16);
  const signingKeyId = `${deviceId}-${fingerprint}`;
  return {
    config: { privateKeyPem, publicKeyPem, signingKeyId, collectorId: deviceId },
    vk: { publicKeyPem, signingKeyId },
  };
}

/** Signs `obs` and shapes it into a DB row exactly as the observatory stores it. */
function signedRow(id: string, config: SigningKeyConfig): SignedRow {
  const obs = baseObs(id);
  const signed = signObservation(obs, config);
  return {
    id,
    obs_json: JSON.stringify(obs), // base observation, signing fields stored separately
    signature: signed.signature,
    signed_at: signed.signed_at,
    signing_key_id: signed.signing_key_id,
    collector_id: signed.collector_id,
  };
}

describe("verifySignedRows (streaming vault verification)", () => {
  const { config, vk } = makeKey("dev");
  const keys = new Map([[vk.signingKeyId, vk]]);

  it("verifies valid signed rows (no trust manifest)", () => {
    const rows = [signedRow("o1", config), signedRow("o2", config)];
    const t = verifySignedRows(rows, keys, null);
    expect(t.total).toBe(2);
    expect(t.valid).toBe(2);
    expect(t.invalid).toBe(0);
  });

  it("consumes a lazy iterator (a DB cursor), not just an array", () => {
    function* gen(): Generator<SignedRow> {
      yield signedRow("g1", config);
      yield signedRow("g2", config);
    }
    const t = verifySignedRows(gen(), keys, null);
    expect(t.total).toBe(2);
    expect(t.valid).toBe(2);
  });

  it("flags a tampered obs_json as invalid (signature no longer matches)", () => {
    const row = signedRow("bad", config);
    row.obs_json = JSON.stringify({ ...JSON.parse(row.obs_json), value_bool: false });
    const t = verifySignedRows([row], keys, null);
    expect(t.valid).toBe(0);
    expect(t.invalid).toBe(1);
  });

  it("counts an unknown signing_key_id", () => {
    const row = signedRow("u", config);
    row.signing_key_id = "someone-else-0000";
    const t = verifySignedRows([row], keys, null);
    expect(t.unknownKey).toBe(1);
    expect(t.invalid).toBe(1);
  });

  it("counts an unparseable obs_json", () => {
    const row = signedRow("p", config);
    row.obs_json = "{not json";
    const t = verifySignedRows([row], keys, null);
    expect(t.parseErrors).toBe(1);
  });

  it("rejects a row whose signature falls outside the key's trusted window", () => {
    const manifest: TrustedKeysManifest = {
      kind: "observatory-trusted-keys",
      schemaVersion: 1,
      updatedAt: "2026-07-01T00:00:00Z",
      keys: [
        {
          signingKeyId: vk.signingKeyId,
          deviceId: "dev",
          pemFile: "dev.pem",
          sha256: "x",
          status: "retired",
          validFrom: "2000-01-01T00:00:00Z",
          validUntil: "2001-01-01T00:00:00Z", // long expired → signed_at (now) is out of window
        },
      ],
    };
    const t = verifySignedRows([signedRow("late", config)], keys, manifest);
    expect(t.untrusted).toBe(1);
    expect(t.invalid).toBe(1);
    expect(t.failedIds[0]).toContain("untrusted");
  });

  it("bounds the retained failedIds while counting every failure", () => {
    const rows = Array.from({ length: 10 }, (_, i) => {
      const r = signedRow(`f${i}`, config);
      r.signing_key_id = "unknown-key"; // all fail
      return r;
    });
    const t = verifySignedRows(rows, keys, null, { maxFailedIds: 3 });
    expect(t.failedCount).toBe(10);
    expect(t.failedIds).toHaveLength(3);
    expect(t.invalid).toBe(10);
  });
});
