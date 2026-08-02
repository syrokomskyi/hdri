/*
<MODULE_CONTRACT>
<purpose>Provides a streaming SHA-256 hash function for arbitrary files.</purpose>
<non-goals>
  <item>Does not hash in-memory buffers — only file paths via streaming.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract hashDatabaseFile from @syrokomskyi/business-core/cross-db.ts into a general-purpose file hashing utility.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * Computes the SHA256 hex digest of a file via streaming.
 * Used for provenance tracking (e.g. hashing SQLite database files for pipeline_inputs).
 */
export const hashFile = async (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
};
