import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendCapsuleSealArtifacts,
  createQuarterCapsuleStaging,
  sha256File,
  validateManifestSet,
  DEFAULT_INSTRUMENT_PLAN,
  type CapsuleArtifact,
  type QuarterCapsule,
  type WorkKey,
} from "@syrokomskyi/factory-core";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))),
);

const period = "2026-q3";
const capsuleId = "019c0000-0000-7000-8000-000000000001";
const deviceId = "device-a";

const readManifest = async (capsuleDir: string): Promise<QuarterCapsule> =>
  JSON.parse(await fs.readFile(path.join(capsuleDir, "capsule-staging.json"), "utf8"));

const writeArtifact = async (
  capsuleDir: string,
  uri: string,
  content: string,
): Promise<CapsuleArtifact> => {
  const target = path.join(capsuleDir, uri);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  const stat = await fs.stat(target);
  return { stage: "qc", uri, sha256: await sha256File(target), bytes: stat.size };
};

/**
 * Mirrors what sealStage appends for one stage: the signed seal file, the
 * frozen target set, and the stage's declared output artifacts — all written
 * before emit-bundle runs.
 */
const sealStageIntoManifest = async (
  capsuleDir: string,
  stageId: WorkKey["stageId"],
  outputArtifacts: readonly CapsuleArtifact[],
): Promise<void> => {
  const seal = await writeArtifact(
    capsuleDir,
    `staging/stage-seals/${stageId}.json`,
    `${JSON.stringify({ payload: { selectedResultSetSha256: "b".repeat(64) } }, null, 2)}\n`,
  );
  const targets = await writeArtifact(
    capsuleDir,
    `staging/targets/${stageId}.json`,
    `${JSON.stringify({ stageId, targetSetSha256: "c".repeat(64), workKeyIds: [] }, null, 2)}\n`,
  );
  await appendCapsuleSealArtifacts(capsuleDir, stageId, [seal, targets, ...outputArtifacts]);
};

const writeOutputArtifact = async (
  capsuleDir: string,
  stage: CapsuleArtifact["stage"],
  uri: string,
  content: string,
): Promise<CapsuleArtifact> => {
  const entry = await writeArtifact(capsuleDir, uri, content);
  return { ...entry, stage };
};

describe("RFC-0128 staging manifest admission", () => {
  it("RFC-0128 AC-4: manifest carries every upstream stage entry before emit-bundle and validateManifestSet admits it", async () => {
    const capsuleDir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-staging-admission-"));
    roots.push(capsuleDir);

    // quarter:init creates the empty declared container.
    await createQuarterCapsuleStaging(
      capsuleDir,
      { period, capsuleId, deviceId },
      DEFAULT_INSTRUMENT_PLAN,
    );
    expect((await readManifest(capsuleDir)).artifacts).toHaveLength(0);

    // Each upstream stage seals into the manifest — before emit-bundle runs.
    const livenessDb = await writeOutputArtifact(
      capsuleDir,
      "liveness",
      `artifacts/liveness/${deviceId}/liveness-2026-q3.db`,
      "liveness snapshot",
    );
    await sealStageIntoManifest(capsuleDir, "liveness", [livenessDb]);

    const pagesDb = await writeOutputArtifact(
      capsuleDir,
      "profile",
      `artifacts/profile/${deviceId}/pages-2026-q3.db`,
      "pages snapshot",
    );
    await sealStageIntoManifest(capsuleDir, "homepage-capture", []);
    await sealStageIntoManifest(capsuleDir, "detected-page-capture", [pagesDb]);

    const axeDb = await writeOutputArtifact(
      capsuleDir,
      "axe",
      `artifacts/axe/${deviceId}/axe-2026-q3.db`,
      "axe snapshot",
    );
    await sealStageIntoManifest(capsuleDir, "axe", [axeDb]);

    // The manifest discover-sources consumes already exists with all entries.
    const manifest = await readManifest(capsuleDir);
    expect(manifest.state).toBe("staging");
    expect(manifest.deviceId).toBe(deviceId);
    expect(manifest.artifacts.map((a) => a.uri).sort()).toEqual(
      [
        `artifacts/axe/${deviceId}/axe-2026-q3.db`,
        `artifacts/liveness/${deviceId}/liveness-2026-q3.db`,
        `artifacts/profile/${deviceId}/pages-2026-q3.db`,
        "staging/stage-seals/axe.json",
        "staging/stage-seals/detected-page-capture.json",
        "staging/stage-seals/homepage-capture.json",
        "staging/stage-seals/liveness.json",
        "staging/targets/axe.json",
        "staging/targets/detected-page-capture.json",
        "staging/targets/homepage-capture.json",
        "staging/targets/liveness.json",
      ].sort(),
    );

    // Admission: the required instruments resolve to their seal stages
    // (profile → homepage-capture + detected-page-capture).
    const verified = await validateManifestSet(
      [path.join(capsuleDir, "capsule-staging.json")],
      new Map(),
      period,
      capsuleId,
    );
    expect(verified.deviceIds).toEqual([deviceId]);
    expect([...verified.stageSeals.keys()].sort()).toEqual([
      "axe",
      "detected-page-capture",
      "homepage-capture",
      "liveness",
    ]);
    expect(verified.artifactRefs.get("detected-page-capture")).toEqual([pagesDb.uri]);
  });
});
