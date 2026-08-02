/*
<MODULE_CONTRACT>
<purpose>Resolves observation conflicts in SQLite without retaining the quarter in memory.</purpose>
<non-goals><item>Does not sign or emit observations.</item></non-goals>
</MODULE_CONTRACT>
*/

import Database from "better-sqlite3";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext } from "../pipeline/types.js";

export class ResolveConflictsGogol extends Gogol {
  override readonly id = "resolve-conflicts";

  override async run(ctx: PipelineContext): Promise<void> {
    const dbPath = ctx.state.observationDbPath;
    if (!dbPath) throw new Error("No observation store — run translate-ontology first");
    const db = new Database(dbPath);
    try {
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM observations`).get() as { n: number }).n;
      if (total === 0) throw new Error("No observations to resolve");
      db.exec(`
        DROP TABLE IF EXISTS resolved_observations;
        CREATE TABLE resolved_observations AS
        SELECT payload_json
        FROM (
          SELECT payload_json,
                 ROW_NUMBER() OVER (
                   PARTITION BY conflict_key
                   ORDER BY recorded_at DESC, device_id DESC, seq DESC
                 ) AS rank
          FROM observations
        )
        WHERE rank = 1;
      `);
      const resolved = (
        db.prepare(`SELECT COUNT(*) AS n FROM resolved_observations`).get() as { n: number }
      ).n;
      console.log(
        `[resolve-conflicts] ${resolved} winners persisted; ${total - resolved} conflicts discarded deterministically.`,
      );
    } finally {
      db.close();
    }
  }
}
