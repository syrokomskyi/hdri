/*
<MODULE_CONTRACT>
<purpose>Proves that an independently rebuilt public archive in a pre-declared empty scratch directory is byte-identical to the release candidate.</purpose>
<non-goals><item>Does not rebuild data itself or accept a non-empty scratch origin.</item></non-goals>
</MODULE_CONTRACT>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { sha256Directory, sha256File, type RebuildReceipt } from "../run/release/release-contract";
import type { QuarterCapsule } from "@syrokomskyi/factory-core";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const candidatePath = path.resolve(arg("--candidate") ?? "");
const scratchDir = path.resolve(arg("--scratch") ?? "");
const primaryPublicDir = path.resolve(arg("--primary-public") ?? "");
if (!arg("--candidate") || !arg("--scratch"))
  throw new Error("--candidate and --scratch are required");
const markerPath = path.join(scratchDir, ".hdri-empty-scratch.json");

if (process.argv.includes("--prepare")) {
  await fs.mkdir(scratchDir, { recursive: true });
  const entries = await fs.readdir(scratchDir);
  if (entries.length > 0) throw new Error("Rebuild scratch must be empty before preparation");
  await fs.writeFile(
    markerPath,
    `${JSON.stringify({ schemaVersion: "1", preparedEmptyAt: new Date().toISOString() }, null, 2)}\n`,
  );
} else {
  if (!arg("--primary-public")) throw new Error("--primary-public is required for verification");
  const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8")) as QuarterCapsule;
  const marker = JSON.parse(await fs.readFile(markerPath, "utf8")) as {
    schemaVersion: string;
    preparedEmptyAt: string;
  };
  if (marker.schemaVersion !== "1" || !Number.isFinite(Date.parse(marker.preparedEmptyAt))) {
    throw new Error("Rebuild scratch lacks a valid empty-origin marker");
  }
  const primaryHash = await sha256Directory(primaryPublicDir);
  const rebuiltHash = await sha256Directory(scratchDir, new Set([path.basename(markerPath)]));
  if (primaryHash !== rebuiltHash)
    throw new Error("Empty-scratch rebuild does not reproduce the public archive");
  const receipt: RebuildReceipt = {
    schemaVersion: "1",
    period: candidate.period,
    capsuleId: candidate.capsuleId,
    candidateManifestSha256: await sha256File(candidatePath),
    primaryPublicArchiveHash: primaryHash,
    rebuiltPublicArchiveHash: rebuiltHash,
    preparedEmptyAt: marker.preparedEmptyAt,
    verifiedAt: new Date().toISOString(),
    matched: true,
  };
  const releaseDir = path.join(path.dirname(candidatePath), "artifacts", "qc", "release");
  await fs.mkdir(releaseDir, { recursive: true });
  await fs.writeFile(
    path.join(releaseDir, "rebuild-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: "wx" },
  );
}
