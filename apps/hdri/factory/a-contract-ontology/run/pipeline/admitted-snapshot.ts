/*
<MODULE_CONTRACT>
  <purpose>Copy an admitted closed SQLite snapshot into app-owned scratch without opening retained evidence.</purpose>
  <non-goals><item>Does not authenticate a caller-supplied artifact or modify original database sidecars.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115 B5: share byte-exact snapshot acquisition between translation and emission.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: SQLite may create sidecars even on read-only opens; only private verified copies are opened.

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertRelativeArtifactUri, copyVerifiedArtifact } from "@syrokomskyi/factory-core";
import type { AdmittedSnapshot } from "./types.js";

export async function copyAdmittedSnapshot(
  source: AdmittedSnapshot,
  scratchDir: string,
): Promise<string> {
  assertRelativeArtifactUri(source.artifact.uri);
  const original = path.resolve(source.capsuleDir, source.artifact.uri);
  const wal = await fs.stat(`${original}-wal`).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (wal && wal.size > 0) throw new Error("Admitted snapshot has an unclosed WAL");
  const snapshot = path.join(scratchDir, `${randomUUID()}.sqlite`);
  await copyVerifiedArtifact(original, snapshot, source.artifact.sha256);
  if ((await fs.stat(snapshot)).size !== source.artifact.bytes)
    throw new Error("Snapshot size differs from admission");
  return snapshot;
}
