import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { generateSigningKey, type SigningKeyConfig } from "@syrokomskyi/observatory-crypto";
import { describe, expect, it } from "vitest";
import { resolveObservationConflicts } from "../gogols/ResolveConflictsGogol.js";
import { signResolvedObservations } from "../gogols/SignBundleGogol.js";

const key = (): SigningKeyConfig => {
  const generated = generateSigningKey();
  return {
    ...generated,
    collectorId: "test-device",
    signingKeyId: `test-device-${createHash("sha256").update(generated.publicKeyPem).digest("hex").slice(0, 16)}`,
  };
};

const payload = (observationId: string, assetId: string, signalPath: string): string =>
  JSON.stringify({
    observation_id: observationId,
    asset_id: assetId,
    signal_path: signalPath,
    recorded_at: "2026-07-02T00:00:00.000Z",
    value_type: "bool",
    value_bool: true,
    _device_id: "test-device",
  });

describe("quarter observation stream recovery", () => {
  it("resumes signing without duplicates and freezes conflict winners once signing starts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-quarter-stream-"));
    const dbPath = path.join(root, "observations.sqlite");
    try {
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE translation_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE observations (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          observation_id TEXT NOT NULL UNIQUE,
          conflict_key TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          device_id TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          payload_json TEXT NOT NULL
        );
      `);
      const insert = db.prepare(`
        INSERT INTO observations(
          observation_id, conflict_key, recorded_at, device_id, payload_sha256, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      const add = (
        observationId: string,
        conflictKey: string,
        recordedAt: string,
        deviceId: string,
      ): void => {
        const json = payload(observationId, conflictKey.split("\0")[0]!, conflictKey.split("\0")[1]!);
        insert.run(
          observationId,
          conflictKey,
          recordedAt,
          deviceId,
          createHash("sha256").update(json).digest("hex"),
          json,
        );
      };
      add("obs-a", "asset-1\0signal.one", "2026-07-01T00:00:00.000Z", "device-a");
      add("obs-b", "asset-1\0signal.one", "2026-07-02T00:00:00.000Z", "device-b");
      add("obs-c", "asset-2\0signal.two", "2026-07-01T00:00:00.000Z", "device-a");
      db.close();

      expect(resolveObservationConflicts(dbPath)).toMatchObject({ total: 3, resolved: 2 });
      const signingKey = key();
      expect(signResolvedObservations(dbPath, signingKey)).toMatchObject({
        signedNow: 2,
        signedTotal: 2,
      });
      expect(signResolvedObservations(dbPath, signingKey)).toMatchObject({
        signedNow: 0,
        signedTotal: 2,
      });

      const changed = new Database(dbPath);
      const json = payload("obs-d", "asset-2", "signal.two");
      changed.prepare(`
        INSERT INTO observations(
          observation_id, conflict_key, recorded_at, device_id, payload_sha256, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        "obs-d",
        "asset-2\0signal.two",
        "2026-07-03T00:00:00.000Z",
        "device-c",
        createHash("sha256").update(json).digest("hex"),
        json,
      );
      changed.close();
      expect(() => resolveObservationConflicts(dbPath)).toThrow(/correction capsule/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
