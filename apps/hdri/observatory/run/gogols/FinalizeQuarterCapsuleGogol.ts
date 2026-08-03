/*
<MODULE_CONTRACT>
<purpose>Adds canonical identity, vault and publication closure, then creates the sole final quarter-capsule seal.</purpose>
<non-goals><item>Does not mutate Factory staging artifacts or previously sealed capsules.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0025 moves final sealing behind Observatory publication.</item></CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import { loadSigningKeyFromEnv } from "@syrokomskyi/observatory-crypto";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { sealQuarterCapsule, verifyQuarterCapsuleArtifacts, verifyQuarterCapsuleSignature, type CapsuleArtifact, type CapsuleSignature, type QuarterCapsule } from "@syrokomskyi/factory-core";
import { writeParquet } from "@syrokomskyi/observatory-vault";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { openObservatoryDb } from "../db/connection";
import { inputDir } from "../config";

const hashFile = async (file: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(file);
  stream.on("data", (chunk) => hash.update(chunk)); stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

export class FinalizeQuarterCapsuleGogol extends Gogol {
  override readonly id = "finalize-quarter-capsule";

  override async run(ctx: PipelineContext): Promise<void> {
    const { runId, capsuleDir, vaultShardPaths = [], martPaths = [], brief } = ctx.state;
    if (!runId || !capsuleDir) throw new Error("Capsule finalization requires synced Observatory run state");
    const finalManifestPath = path.join(capsuleDir, "capsule-manifest.json");
    let finalCapsule: QuarterCapsule | null = null;
    try {
      finalCapsule = JSON.parse(await fsp.readFile(finalManifestPath, "utf8")) as QuarterCapsule;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (finalCapsule) {
      const signingKey = loadSigningKeyFromEnv();
      await verifyQuarterCapsuleArtifacts(capsuleDir, finalCapsule);
      if (finalCapsule.period !== brief.period) throw new Error("Existing quarter capsule period mismatch");
      try {
        const signature = JSON.parse(await fsp.readFile(path.join(capsuleDir, "capsule-signature.json"), "utf8")) as CapsuleSignature;
        if (!verifyQuarterCapsuleSignature(finalCapsule, signature, signingKey)) {
          throw new Error("Existing quarter capsule signature verification failed");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await sealQuarterCapsule(capsuleDir, finalCapsule, signingKey);
      }
      console.log(`[finalize-quarter-capsule] Existing sealed capsule verified; no artifacts rewritten.`);
      return;
    }
    const stagingPath = path.join(capsuleDir, "capsule-staging.json");
    const staging = JSON.parse(await fsp.readFile(stagingPath, "utf8")) as QuarterCapsule;
    if (staging.period !== brief.period) throw new Error("Factory staging capsule period mismatch");

    const artifacts: CapsuleArtifact[] = [...staging.artifacts];
    const retain = async (stage: CapsuleArtifact["stage"], source: string, uri: string): Promise<void> => {
      const destination = path.join(capsuleDir, uri);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      if (path.resolve(source) !== path.resolve(destination)) await fsp.copyFile(source, destination);
      const stat = await fsp.stat(destination);
      artifacts.push({ stage, uri, sha256: await hashFile(destination), bytes: stat.size });
    };

    const year = parsePeriod(brief.period).year;
    const db = openObservatoryDb(year);
    try {
      const identities = db.prepare(`
        SELECT s.asset_id AS canonical_asset_id, s.domain, m.provisional_id, m.first_seen
        FROM asset_states s JOIN asset_id_map m ON m.canonical_id = s.asset_id
        WHERE s.run_id = ? ORDER BY s.asset_id
      `).all(runId) as object[];
      if (identities.length === 0) throw new Error("Cannot seal capsule without canonical UUID v7 identities");
      const identityPath = path.join(capsuleDir, "artifacts", "identity", "asset-identities.parquet");
      await fsp.mkdir(path.dirname(identityPath), { recursive: true });
      await writeParquet(identities, identityPath);
      const stat = await fsp.stat(identityPath);
      artifacts.push({ stage: "identity", uri: "artifacts/identity/asset-identities.parquet", sha256: await hashFile(identityPath), bytes: stat.size });
    } finally { db.close(); }

    for (const source of vaultShardPaths) await retain("vault", source, `artifacts/vault/${path.basename(source)}`);
    for (const source of martPaths) await retain("publication", source, `artifacts/publication/${path.basename(source)}`);
    await retain("methodology", path.join(inputDir, "codebook.yaml"), "artifacts/methodology/codebook.yaml");

    await sealQuarterCapsule(capsuleDir, { ...staging, state: "sealed", artifacts });
  }
}
