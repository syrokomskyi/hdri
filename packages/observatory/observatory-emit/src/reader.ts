/*
<MODULE_CONTRACT>
<purpose>Streams and verifies every immutable partition in a forward-only emit bundle.</purpose>
<non-goals><item>Does not accept monolithic or legacy manifests.</item></non-goals>
</MODULE_CONTRACT>
*/

import crypto, { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type { AssetStateRecord, Observation } from "@syrokomskyi/observatory-core";
import type { EmitBundle, EmitManifest, EmitPartition } from "./types.js";
import { parseEmitManifest } from "./schema.js";

export const readEmitManifest = async (emitDir: string): Promise<EmitManifest> => {
  const manifestPath = path.join(emitDir, "manifest.json");
  try {
    return parseEmitManifest(JSON.parse(await fsp.readFile(manifestPath, "utf8")));
  } catch (error) {
    throw new Error(`Invalid emit-bundle manifest at ${manifestPath}`, { cause: error });
  }
};

export const readEmitBundle = async (emitDir: string): Promise<EmitBundle> => ({ manifest: await readEmitManifest(emitDir), emitDir });

async function* streamPartitions<T>(bundle: EmitBundle, parts: readonly EmitPartition[], expectedSetHash: string | null): AsyncGenerator<T> {
  const setHash = parts.length === 0 ? null : createHash("sha256").update(parts.map((part) => `${part.uri}\0${part.row_count}\0${part.sha256}`).join("\n")).digest("hex");
  if (setHash !== expectedSetHash) throw new Error("Emit partition-set hash mismatch");
  for (const part of parts) {
    const hash = crypto.createHash("sha256");
    let count = 0;
    const lines = readline.createInterface({ input: fs.createReadStream(path.join(bundle.emitDir, part.uri), { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      hash.update(`${line}\n`);
      count++;
      yield JSON.parse(line) as T;
    }
    if (count !== part.row_count || hash.digest("hex") !== part.sha256) throw new Error(`Emit partition integrity check failed: ${part.uri}`);
  }
}

export async function* streamObservations(bundle: EmitBundle): AsyncGenerator<Observation> {
  let count = 0;
  for await (const observation of streamPartitions<Observation>(bundle, bundle.manifest.observation_partitions, bundle.manifest.bundle_hash)) {
    count++;
    yield observation;
  }
  if (count !== bundle.manifest.observation_count) throw new Error("Emit observation count mismatch");
}

export async function* streamAssetStates(bundle: EmitBundle): AsyncGenerator<AssetStateRecord> {
  let count = 0;
  for await (const state of streamPartitions<AssetStateRecord>(bundle, bundle.manifest.asset_state_partitions, bundle.manifest.asset_states_hash)) {
    count++;
    yield state;
  }
  if (count !== bundle.manifest.asset_state_count) throw new Error("Emit asset-state count mismatch");
}

export async function* streamEvidence<T = unknown>(bundle: EmitBundle): AsyncGenerator<T> {
  let count = 0;
  for await (const record of streamPartitions<T>(
    bundle,
    bundle.manifest.evidence_partitions,
    bundle.manifest.evidence_hash,
  )) {
    count++;
    yield record;
  }
  if (count !== bundle.manifest.evidence_count) throw new Error("Emit evidence count mismatch");
}
