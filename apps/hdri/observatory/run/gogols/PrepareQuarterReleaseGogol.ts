/*
<MODULE_CONTRACT>
<purpose>Builds a complete immutable quarter release candidate without granting the final scientific seal.</purpose>
<non-goals><item>Does not sign or publish a quarter; release gates run after this candidate exists.</item></non-goals>
</MODULE_CONTRACT>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import { getTransparencyKeysDir, loadVerificationKeys } from "@syrokomskyi/observatory-crypto";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  verifyQuarterExecutionClosure,
  writeQuarterCapsuleCandidate,
  type CapsuleArtifact,
  type CapsuleSignature,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { writeParquet } from "@syrokomskyi/observatory-vault";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { openObservatoryDb } from "../db/connection";
import { inputDir } from "../config";

const hashFile = async (file: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(file);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

export class PrepareQuarterReleaseGogol extends Gogol {
  override readonly id = "prepare-quarter-release";

  override async run(ctx: PipelineContext): Promise<void> {
    const { runId, capsuleDir, vaultShardPaths = [], martPaths = [], brief } = ctx.state;
    if (!runId || !capsuleDir) throw new Error("Quarter release preparation requires synced Observatory run state");
    const candidatePath = path.join(capsuleDir, "capsule-candidate.json");
    const verificationKeys = await loadVerificationKeys(getTransparencyKeysDir());
    const finalPath = path.join(capsuleDir, "capsule-manifest.json");
    let finalExists = true;
    try {
      await fsp.access(finalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      finalExists = false;
    }
    if (finalExists) {
      const finalCapsule = JSON.parse(await fsp.readFile(finalPath, "utf8")) as QuarterCapsule;
      const signature = JSON.parse(
        await fsp.readFile(path.join(capsuleDir, "capsule-signature.json"), "utf8"),
      ) as CapsuleSignature;
      const verificationKey = verificationKeys.get(signature.signingKeyId);
      if (
        finalCapsule.state !== "sealed" ||
        finalCapsule.period !== brief.period ||
        finalCapsule.capsuleId !== brief.capsuleId ||
        !verificationKey ||
        !verifyQuarterCapsuleSignature(finalCapsule, signature, verificationKey)
      ) {
        throw new Error("Existing quarter release seal is invalid");
      }
      await verifyQuarterCapsuleArtifacts(capsuleDir, finalCapsule);
      ctx.state.candidateManifestPath = finalPath;
      return;
    }
    try {
      const existing = JSON.parse(await fsp.readFile(candidatePath, "utf8")) as QuarterCapsule;
      await verifyQuarterCapsuleArtifacts(capsuleDir, existing);
      ctx.state.candidateManifestPath = candidatePath;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const staging = JSON.parse(await fsp.readFile(path.join(capsuleDir, "capsule-staging.json"), "utf8")) as QuarterCapsule;
    if (staging.period !== brief.period || staging.capsuleId !== brief.capsuleId) {
      throw new Error("Factory staging capsule identity mismatch");
    }
    await verifyQuarterExecutionClosure(
      capsuleDir,
      staging.instrumentPlan.filter((entry) => entry.state === "required").map((entry) => entry.instrument),
      verificationKeys,
    );

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
      if (identities.length === 0) throw new Error("Cannot prepare release without canonical UUID v7 identities");
      const identityPath = path.join(capsuleDir, "artifacts", "identity", "asset-identities.parquet");
      await fsp.mkdir(path.dirname(identityPath), { recursive: true });
      await writeParquet(identities, identityPath);
      const stat = await fsp.stat(identityPath);
      artifacts.push({ stage: "identity", uri: "artifacts/identity/asset-identities.parquet", sha256: await hashFile(identityPath), bytes: stat.size });
    } finally {
      db.close();
    }

    for (const source of vaultShardPaths) await retain("vault", source, `artifacts/vault/${path.basename(source)}`);
    for (const source of martPaths) await retain("publication", source, `artifacts/publication/${path.basename(source)}`);
    for (const name of ["codebook.yaml", "ontology.yaml", "population-frame.json"]) {
      const source = path.join(inputDir, name);
      try {
        await fsp.access(source);
        await retain("methodology", source, `artifacts/methodology/${name}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        if (name !== "population-frame.json") throw error;
      }
    }

    const candidate = { ...staging, state: "candidate" as const, artifacts };
    ctx.state.candidateManifestPath = await writeQuarterCapsuleCandidate(capsuleDir, candidate);
  }
}
