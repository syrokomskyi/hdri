/*
<MODULE_CONTRACT>
  <purpose>Bind emission retries to one derivation and verify committed partitions before resuming archival retention.</purpose>
  <non-goals><item>Does not certify capsule closure or modify existing committed bundle bytes.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0115 B5: distinguish committed emission from complete archival retention on retry.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: A committed emit manifest is not proof that raw evidence retention completed.

import fs from "node:fs/promises";
import path from "node:path";
import { copyVerifiedArtifact, sha256File } from "@syrokomskyi/factory-core";
import {
  readEmitManifest,
  streamObservations,
  streamAssetStates,
  streamEvidence,
  type EmitManifest,
} from "@syrokomskyi/observatory-emit";

export async function bindEmissionDerivation(
  emitDir: string,
  derivationPath: string,
): Promise<void> {
  const entries = await fs.readdir(emitDir).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return [] as string[];
  });
  if (entries.length > 0 && !entries.includes("derivation.json")) {
    throw new Error(
      "Existing emission has no derivation binding; preserve it for explicit recovery",
    );
  }
  await copyVerifiedArtifact(
    derivationPath,
    path.join(emitDir, "derivation.json"),
    await sha256File(derivationPath),
  );
}

export async function readVerifiedEmission(
  emitDir: string,
  expected: Pick<
    EmitManifest,
    "app_id" | "collector_version" | "ruleset_version" | "ontology_version" | "run_id" | "period"
  >,
): Promise<EmitManifest | null> {
  const exists = await fs
    .stat(path.join(emitDir, "manifest.json"))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
  if (!exists) return null;
  const manifest = await readEmitManifest(emitDir);
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (manifest[key] !== expected[key])
      throw new Error(`Committed emission ${key} differs from current derivation`);
  }
  const bundle = { emitDir, manifest };
  // Consume to EOF: readers verify hashes and counts only after the final row.
  for await (const _ of streamObservations(bundle)) {
    /* verification */
  }
  for await (const _ of streamAssetStates(bundle)) {
    /* verification */
  }
  for await (const _ of streamEvidence(bundle)) {
    /* verification */
  }
  return manifest;
}
