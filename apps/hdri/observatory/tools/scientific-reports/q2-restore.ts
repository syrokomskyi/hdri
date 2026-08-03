/*
<MODULE_CONTRACT>
<purpose>Verifies Q2 archive restore drill: checks that the Q2 archive exists and its artifacts can be restored.</purpose>
<non-goals><item>Does not perform a full data restore — verifies archive integrity and drill marker.</item></non-goals>
</MODULE_CONTRACT>
*/

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { arg, fileExists, requireCommonArgs, writeReport } from "./shared";

const hashFile = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const q2ArchiveDir = arg("--q2-archive-dir");
const drillMarker = arg("--drill-marker");

const violations: string[] = [];
const warnings: string[] = [];

if (!q2ArchiveDir) {
  violations.push("q2_archive_dir_missing");
} else {
  const archivePath = path.resolve(q2ArchiveDir);
  if (!(await fileExists(archivePath))) {
    violations.push("q2_archive_not_found");
  } else {
    const manifestPath = path.join(archivePath, "archive-manifest.json");
    if (!(await fileExists(manifestPath))) {
      violations.push("q2_archive_manifest_missing");
    } else {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
        artifacts: { uri: string; sha256: string }[];
      };
      for (const artifact of manifest.artifacts) {
        const artifactPath = path.join(archivePath, artifact.uri);
        if (!(await fileExists(artifactPath))) {
          violations.push(`q2_artifact_missing:${artifact.uri}`);
        } else if ((await hashFile(artifactPath)) !== artifact.sha256) {
          violations.push(`q2_artifact_hash_mismatch:${artifact.uri}`);
        }
      }
    }
  }
}

if (drillMarker && !(await fileExists(path.resolve(drillMarker)))) {
  violations.push("q2_restore_drill_marker_missing");
}

await writeReport(
  "q2-restore",
  "q2-restore.json",
  evidenceDir,
  period,
  capsuleId,
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
);
