import crypto from "node:crypto";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { generateSigningKey, signObservation } from "@syrokomskyi/observatory-crypto";
import type {
  SigningKeyConfig,
  TrustedKeysManifest,
  VerificationKey,
} from "@syrokomskyi/observatory-crypto";
import type { Observation } from "@syrokomskyi/observatory-core";
import { verifySignedRows, type SignedRow } from "../verify/verify-core";
import { migrateObservatory } from "../db/migrate.js";
import { streamInsertObservations } from "../db/sync-writers.js";

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

  it("rejects a database ID different from the cryptographically signed observation ID", () => {
    const row = signedRow("signed-id", config);
    row.id = "different-row-id";
    expect(verifySignedRows([row], keys, null)).toMatchObject({
      total: 1,
      valid: 0,
      invalid: 1,
      inconsistent: 1,
    });
  });

  it("accepts a retained signed JSON envelope without rewriting its bytes", () => {
    const row = signedRow("envelope", config);
    const { id: _id, obs_json, ...metadata } = row;
    row.obs_json = JSON.stringify({ ...JSON.parse(obs_json), ...metadata }, null, 2) + "\n";
    const before = structuredClone(row);
    expect(verifySignedRows([row], keys, null)).toMatchObject({ valid: 1, inconsistent: 0 });
    expect(row).toEqual(before);
  });

  it.each(["signature", "signed_at", "signing_key_id", "collector_id"] as const)(
    "rejects conflicting embedded %s instead of overwriting retained evidence",
    (field) => {
      const row = signedRow("conflict", config);
      const { id: _id, obs_json, ...metadata } = row;
      row.obs_json = JSON.stringify({ ...JSON.parse(obs_json), ...metadata, [field]: "different" });
      expect(verifySignedRows([row], keys, null)).toMatchObject({
        valid: 0,
        invalid: 1,
        inconsistent: 1,
      });
    },
  );

  it.each(["signature", "signed_at", "signing_key_id", "collector_id"] as const)(
    "rejects a partially embedded signing envelope containing only %s",
    (field) => {
      const row = signedRow("partial", config);
      row.obs_json = JSON.stringify({ ...JSON.parse(row.obs_json), [field]: row[field] });
      expect(verifySignedRows([row], keys, null)).toMatchObject({
        valid: 0,
        invalid: 1,
        inconsistent: 1,
      });
    },
  );

  it.each(["null", "[]", "true", '"text"', "42"])(
    "counts non-object JSON %s as malformed input",
    (payload) => {
      const row = signedRow("shape", config);
      row.obs_json = payload;
      expect(verifySignedRows([row], keys, null)).toMatchObject({
        total: 1,
        valid: 0,
        invalid: 1,
        parseErrors: 1,
      });
    },
  );

  it.each([NaN, Infinity, -1, 0.5, 10_001])(
    "rejects invalid diagnostic limit %s before consuming rows",
    (maxFailedIds) => {
      let consumed = false;
      function* rows() {
        consumed = true;
        yield signedRow("unused", config);
      }
      expect(() => verifySignedRows(rows(), keys, null, { maxFailedIds })).toThrow(/maxFailedIds/);
      expect(consumed).toBe(false);
    },
  );

  it("allows zero retained diagnostics without suppressing failure counts", () => {
    const row = signedRow("mismatch", config);
    row.id = "other";
    expect(verifySignedRows([row], keys, null, { maxFailedIds: 0 })).toMatchObject({
      valid: 0,
      invalid: 1,
      inconsistent: 1,
      failedCount: 1,
      failedIds: [],
    });
  });

  it("continues after an inconsistent row and does not certify an interrupted stream", () => {
    const row = signedRow("mismatch", config);
    row.id = "other";
    expect(verifySignedRows([row, signedRow("good", config)], keys, null)).toMatchObject({
      total: 2,
      valid: 1,
      invalid: 1,
      inconsistent: 1,
    });
    let closed = false;
    function* interrupted() {
      try {
        yield signedRow("good", config);
        throw new Error("source interrupted");
      } finally {
        closed = true;
      }
    }
    expect(() => verifySignedRows(interrupted(), keys, null)).toThrow("source interrupted");
    expect(closed).toBe(true);
  });

  it("bounds each diagnostic even when the source contains an oversized ID", () => {
    const row = signedRow("x".repeat(10_000), config);
    row.signing_key_id = "unknown";
    const result = verifySignedRows([row], keys, null);
    expect(result.failedIds[0]).toHaveLength(512);
    expect(result.failedCount).toBe(1);
  });

  it("checks actual migrated database rows produced by the current streaming writer", async () => {
    const db = new Database(":memory:");
    try {
      migrateObservatory(db);
      const observation: Observation = {
        observation_id: "0198f000-0000-7000-8000-000000000001",
        asset_id: "0198f000-0000-7000-8000-000000000002",
        crawl_id: "retained-crawl",
        signal_path: "web.presence",
        value_bool: true,
        value_num: null,
        value_str: null,
        value_json: null,
        value_type: "bool",
        observed_at: "2026-05-02T10:00:00+02:00",
        recorded_at: "2026-05-03T11:00:00Z",
        collector_version: "1",
        probe_version: null,
        ruleset_version: "1",
        source_hash: null,
        crawl_hash: "2026-q2-de",
        evidence_ref: null,
        confidence: 1,
        status: "active",
        superseded_by: null,
        deprecated_reason: null,
      };
      async function* observations() {
        yield observation;
      }
      expect(
        await streamInsertObservations(db, observations(), {
          runId: "retained-run",
          ontologyVersion: "1",
          period: "2026-q2",
          factoryRunId: "factory-run",
        }),
      ).toEqual({ inserted: 1, seen: 1 });
      const signed = signObservation(observation, config);
      db.prepare(
        "UPDATE observations SET signature=?, signed_at=?, signing_key_id=?, collector_id=?",
      ).run(signed.signature, signed.signed_at, signed.signing_key_id, signed.collector_id);
      const rows = () =>
        db
          .prepare(
            "SELECT id, obs_json, signature, signed_at, signing_key_id, collector_id FROM observations",
          )
          .iterate() as IterableIterator<SignedRow>;
      const before = db.prepare("SELECT obs_json FROM observations").pluck().get();
      expect(verifySignedRows(rows(), keys, null)).toMatchObject({
        total: 1,
        valid: 1,
        inconsistent: 0,
      });
      expect(db.prepare("SELECT obs_json FROM observations").pluck().get()).toBe(before);
      db.prepare("UPDATE observations SET id=?").run("substituted-id");
      expect(verifySignedRows(rows(), keys, null)).toMatchObject({
        total: 1,
        valid: 0,
        inconsistent: 1,
      });
    } finally {
      db.close();
    }
  });
});
