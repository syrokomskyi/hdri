/*
<MODULE_CONTRACT>
<purpose>Builds a complete immutable quarter release candidate without granting the final scientific seal.</purpose>
<non-goals><item>Does not sign or publish a quarter; release gates run after this candidate exists.</item></non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing PrepareQuarterReleaseGogol module contract for Compass-aware maintenance.</item>
  <item>RFC-0108: admit only PublicProductRef entries as publication artifacts. Read from public-manifest.json instead of blindly admitting all martPaths.</item>
  <item>RFC-0109: output release-input.json manifest with capsule, evidence, public manifest, rebuild receipt, replica config, vault dir, public archive root refs. Set ctx.state.releaseInputPath.</item>
  <item>RFC-0115: retain publication intent, the optional quarter-bound classification decision and public manifest before candidate validation.</item>
  <item>Export complete current-run identities through explicit provisional mappings; reject missing or ambiguous mappings.</item>
</CHANGE_SUMMARY>
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
import { inputDir, outputRootDir } from "../config";
import { readRetainedPublicationScope } from "../release/publication-scope";
import { requiredRetainedScientificReports } from "../release/release-contract";
import { verifyPublicationClosure } from "../release/publication-closure";
import { readReleaseIdentities } from "../release/release-identities";

const hashFile = async (file: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });

export class PrepareQuarterReleaseGogol extends Gogol {
  override readonly id = "prepare-quarter-release";

  override async run(ctx: PipelineContext): Promise<void> {
    const { runId, capsuleDir, vaultShardPaths = [], brief } = ctx.state;
    if (!runId || !capsuleDir)
      throw new Error("Quarter release preparation requires synced Observatory run state");
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
      await this.writeReleaseInput(ctx, finalPath);
      return;
    }
    try {
      const existing = JSON.parse(await fsp.readFile(candidatePath, "utf8")) as QuarterCapsule;
      await verifyQuarterCapsuleArtifacts(capsuleDir, existing);
      ctx.state.candidateManifestPath = candidatePath;
      await this.writeReleaseInput(ctx, candidatePath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const staging = JSON.parse(
      await fsp.readFile(path.join(capsuleDir, "capsule-staging.json"), "utf8"),
    ) as QuarterCapsule;
    if (staging.period !== brief.period || staging.capsuleId !== brief.capsuleId) {
      throw new Error("Factory staging capsule identity mismatch");
    }
    await verifyQuarterExecutionClosure(
      capsuleDir,
      staging.instrumentPlan
        .filter((entry) => entry.state === "required")
        .map((entry) => entry.instrument),
      verificationKeys,
    );

    const artifacts: CapsuleArtifact[] = [...staging.artifacts];
    const retain = async (
      stage: CapsuleArtifact["stage"],
      source: string,
      uri: string,
    ): Promise<void> => {
      const destination = path.join(capsuleDir, uri);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      if (path.resolve(source) !== path.resolve(destination))
        await fsp.copyFile(source, destination);
      const stat = await fsp.stat(destination);
      artifacts.push({ stage, uri, sha256: await hashFile(destination), bytes: stat.size });
    };

    const year = parsePeriod(brief.period).year;
    const db = openObservatoryDb(year);
    try {
      const identities = readReleaseIdentities(db, runId);
      const identityPath = path.join(
        capsuleDir,
        "artifacts",
        "identity",
        "asset-identities.parquet",
      );
      await fsp.mkdir(path.dirname(identityPath), { recursive: true });
      await writeParquet(identities, identityPath);
      const stat = await fsp.stat(identityPath);
      artifacts.push({
        stage: "identity",
        uri: "artifacts/identity/asset-identities.parquet",
        sha256: await hashFile(identityPath),
        bytes: stat.size,
      });
    } finally {
      db.close();
    }

    for (const source of vaultShardPaths)
      await retain("vault", source, `artifacts/vault/${path.basename(source)}`);
    const publicManifestPath = ctx.state.publicManifestPath;
    if (publicManifestPath) {
      const manifest = JSON.parse(await fsp.readFile(publicManifestPath, "utf8")) as {
        products: { product: string; format: string }[];
      };
      const manifestDir = path.dirname(publicManifestPath);
      for (const entry of manifest.products) {
        const source = path.join(manifestDir, `${entry.product}.${entry.format}`);
        await retain(
          "publication",
          source,
          `artifacts/publication/${entry.product}.${entry.format}`,
        );
      }
      await retain("publication", publicManifestPath, "artifacts/publication/public-manifest.json");
    }
    for (const name of ["codebook.yaml", "ontology.yaml", "population-frame.json", "publication-scope.yaml", "classification-release-decision.yaml"]) {
      const source = path.join(inputDir, name);
      try {
        await fsp.access(source);
        await retain("methodology", source, `artifacts/methodology/${name}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        if (name !== "population-frame.json" && name !== "publication-scope.yaml" && name !== "classification-release-decision.yaml") throw error;
      }
    }

    const candidate = { ...staging, state: "candidate" as const, artifacts };
    await requiredRetainedScientificReports(capsuleDir, candidate, await readRetainedPublicationScope(capsuleDir, candidate));
    if (!publicManifestPath) throw new Error("Public manifest is required for release preparation");
    await verifyPublicationClosure(capsuleDir, candidate, publicManifestPath);
    ctx.state.candidateManifestPath = await writeQuarterCapsuleCandidate(capsuleDir, candidate);
    await this.writeReleaseInput(ctx, ctx.state.candidateManifestPath);
  }

  private async writeReleaseInput(
    ctx: PipelineContext,
    capsuleManifestPath: string,
  ): Promise<void> {
    const { capsuleDir, brief } = ctx.state;
    if (!capsuleDir) throw new Error("writeReleaseInput requires capsuleDir");
    const vaultDir = brief.vaultDir
      ? path.resolve(brief.vaultDir)
      : path.join(outputRootDir, "vault");
    const releaseInput = {
      schema: "hdri-release-input@1" as const,
      capsuleManifestPath,
      evidenceDir: path.join(capsuleDir, "artifacts", "qc", "release"),
      publicManifestPath: ctx.state.publicManifestPath ?? "",
      rebuildReceiptPath: path.join(
        capsuleDir,
        "artifacts",
        "qc",
        "release",
        "rebuild-receipt.json",
      ),
      replicaConfigPath: path.join(inputDir, "replica-config.json"),
      vaultDir,
      publicArchiveRoot: path.join(outputRootDir, "public-archive"),
    };
    const releaseInputPath = path.join(capsuleDir, "release-input.json");
    await fsp.writeFile(releaseInputPath, `${JSON.stringify(releaseInput, null, 2)}\n`);
    ctx.state.releaseInputPath = releaseInputPath;
  }
}
