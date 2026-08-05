/*
<MODULE_CONTRACT>
<purpose>Resolves observation conflicts in SQLite without retaining the quarter in memory.</purpose>
<non-goals><item>Does not sign or emit observations.</item></non-goals>
</MODULE_CONTRACT>
*/

import crypto from "node:crypto";
import Database from "better-sqlite3";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";

export class ResolveConflictsGogol extends Gogol {
  override readonly id = "resolve-conflicts";

  override async run(ctx: PipelineContext): Promise<void> {
    const dbPath = ctx.state.observationDbPath;
    if (!dbPath) throw new Error("No observation store — run translate-ontology first");
    const { total, resolved, conflicts } = resolveObservationConflicts(dbPath);
    console.log(
      `[resolve-conflicts] ${total} candidates produced ${resolved} winners; ${conflicts} conflicts retained as evidence.`,
    );
  }
}

export const resolveObservationConflicts = (
  dbPath: string,
): { total: number; resolved: number; conflicts: number; resolutionHash: string } => {
    const db = new Database(dbPath);
    try {
      db.pragma("temp_store = FILE");
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM observations`).get() as { n: number }).n;
      if (total === 0) throw new Error("No observations to resolve");
      db.exec(`
        DROP TABLE IF EXISTS resolved_observations_next;
        DROP TABLE IF EXISTS resolved_conflicts_next;
        DROP TABLE IF EXISTS resolution_ranked;
        CREATE TEMP TABLE resolution_ranked AS
        SELECT observation_id, conflict_key, payload_json,
               ROW_NUMBER() OVER (
                 PARTITION BY conflict_key
                 ORDER BY recorded_at DESC, device_id DESC, observation_id DESC
               ) AS rank,
               FIRST_VALUE(observation_id) OVER (
                 PARTITION BY conflict_key
                 ORDER BY recorded_at DESC, device_id DESC, observation_id DESC
               ) AS winner_observation_id
        FROM observations;
        CREATE TABLE resolved_observations_next (
          observation_id TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL
        );
        INSERT INTO resolved_observations_next(observation_id, payload_json)
        SELECT observation_id, payload_json
        FROM resolution_ranked
        WHERE rank = 1
        ORDER BY observation_id;
        CREATE TABLE resolved_conflicts_next (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          conflict_key TEXT NOT NULL,
          winner_observation_id TEXT NOT NULL,
          loser_observation_id TEXT NOT NULL UNIQUE,
          loser_payload_json TEXT NOT NULL
        );
        INSERT INTO resolved_conflicts_next(
          conflict_key, winner_observation_id, loser_observation_id, loser_payload_json
        )
        SELECT conflict_key, winner_observation_id, observation_id, payload_json
        FROM resolution_ranked
        WHERE rank > 1
        ORDER BY observation_id;
      `);
      const resolutionHash = hashResolution(db);
      const storedHash = db
        .prepare("SELECT value FROM translation_meta WHERE key = 'resolution_sha256'")
        .get() as { value: string } | undefined;
      const signedTableExists = Boolean(
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'signed_observations'").get(),
      );
      const signedCount = signedTableExists
        ? (db.prepare("SELECT COUNT(*) AS n FROM signed_observations").get() as { n: number }).n
        : 0;
      if (storedHash && storedHash.value !== resolutionHash && signedCount > 0) {
        throw new Error(
          "Resolved observations changed after signing began; create a new correction capsule",
        );
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec("DROP TABLE IF EXISTS resolved_observations");
        db.exec("DROP TABLE IF EXISTS resolved_conflicts");
        db.exec("ALTER TABLE resolved_observations_next RENAME TO resolved_observations");
        db.exec("ALTER TABLE resolved_conflicts_next RENAME TO resolved_conflicts");
        db.prepare(
          `INSERT INTO translation_meta(key, value) VALUES ('resolution_sha256', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run(resolutionHash);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      const resolved = (
        db.prepare(`SELECT COUNT(*) AS n FROM resolved_observations`).get() as { n: number }
      ).n;
      const conflicts = (
        db.prepare(`SELECT COUNT(*) AS n FROM resolved_conflicts`).get() as { n: number }
      ).n;
      return { total, resolved, conflicts, resolutionHash };
    } finally {
      db.close();
    }
};

const hashResolution = (db: Database.Database): string => {
  const hash = crypto.createHash("sha256");
  const rows = db
    .prepare(`SELECT observation_id, payload_json FROM resolved_observations_next ORDER BY observation_id`)
    .iterate() as IterableIterator<{ observation_id: string; payload_json: string }>;
  for (const row of rows) {
    hash.update("winner\0").update(row.observation_id).update("\0").update(row.payload_json).update("\n");
  }
  const conflicts = db.prepare(`
    SELECT conflict_key, winner_observation_id, loser_observation_id, loser_payload_json
    FROM resolved_conflicts_next ORDER BY loser_observation_id
  `).iterate() as IterableIterator<{
    conflict_key: string;
    winner_observation_id: string;
    loser_observation_id: string;
    loser_payload_json: string;
  }>;
  for (const row of conflicts) {
    hash
      .update("conflict\0")
      .update(row.conflict_key)
      .update("\0")
      .update(row.winner_observation_id)
      .update("\0")
      .update(row.loser_observation_id)
      .update("\0")
      .update(row.loser_payload_json)
      .update("\n");
  }
  return hash.digest("hex");
};
