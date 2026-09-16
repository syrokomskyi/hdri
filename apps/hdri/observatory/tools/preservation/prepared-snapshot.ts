/*
<MODULE_CONTRACT>
<purpose>Share verified private SQLite snapshot consumption across retained observation and harvest readers.</purpose>
<non-goals><item>Does not validate domain schemas, grant admission or enforce filesystem writer exclusion.</item></non-goals>
<!-- risk: crypto, vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Extract the existing observation snapshot boundary for reuse by the harvest source reader.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Open only process-registered private snapshots; exhaustion and final hashing are necessary for complete consumption.
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { assertRelativeObjectPath, inspectRetainedFile } from "@warpgogol/pipeline-node";
import { assertPreparedBaselineSource, type PreparedBaselineSource } from "./preserve.js";

export type SnapshotArtifact = Readonly<{ uri: string; sha256: string; bytes: number }>;

export function streamPreparedSnapshot<T>(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
  domain: "OBSERVATION" | "HARVEST",
  read: (db: Database.Database, artifact: SnapshotArtifact) => Iterable<T>,
): AsyncGenerator<T> {
  assertPreparedBaselineSource(prepared);
  assertRelativeObjectPath(snapshotUri);
  const matches = prepared.manifest.artifacts.filter((artifact) => artifact.uri === snapshotUri);
  if (matches.length !== 1 || matches[0].representation !== "sqlite-snapshot")
    throw new Error(`DECLARED_${domain}_SNAPSHOT_REQUIRED`);
  const expected = { ...matches[0] };
  const file = path.join(prepared.root, snapshotUri);
  const artifact = Object.freeze({
    uri: expected.uri,
    sha256: expected.sha256,
    bytes: expected.bytes,
  });
  async function verifyBytes() {
    let header = Buffer.alloc(0);
    const actual = await inspectRetainedFile(file, (chunk) => {
      if (header.length < 20)
        header = Buffer.concat([header, chunk.subarray(0, 20 - header.length)]);
    });
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes)
      throw new Error(`${domain}_SNAPSHOT_CHANGED`);
    if (
      actual.bytes < 100 ||
      header.subarray(0, 16).toString("binary") !== "SQLite format 3\0" ||
      header[18] !== 1 ||
      header[19] !== 1
    )
      throw new Error(`STANDALONE_${domain}_SNAPSHOT_REQUIRED`);
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      try {
        await fs.lstat(file + suffix);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      throw new Error(`${domain}_SNAPSHOT_SIDECAR`);
    }
  }
  return (async function* () {
    await verifyBytes();
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      db.pragma("query_only=ON");
      db.pragma("trusted_schema=OFF");
      yield* read(db, artifact);
    } finally {
      try {
        db.close();
      } finally {
        await verifyBytes();
      }
    }
  })();
}
