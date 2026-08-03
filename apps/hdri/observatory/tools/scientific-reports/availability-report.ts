/*
<MODULE_CONTRACT>
<purpose>Generates availability and attrition report from liveness data and frame.</purpose>
<non-goals><item>Does not collect liveness data — reads existing liveness DB.</item></non-goals>
</MODULE_CONTRACT>
*/

import path from "node:path";
import { arg, fileExists, readJsonFile, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const livenessDbPath = arg("--liveness-db");
const framePath = arg("--frame");

const violations: string[] = [];
const warnings: string[] = [];

let totalAssets = 0;
let liveCount = 0;
let unavailableCount = 0;
let neverLiveCount = 0;
let attritionRate: number | undefined;

if (!livenessDbPath || !framePath) {
  violations.push("availability_inputs_missing");
} else {
  if (!(await fileExists(path.resolve(livenessDbPath)))) {
    violations.push("liveness_db_not_found");
  } else if (!(await fileExists(path.resolve(framePath)))) {
    violations.push("frame_not_found");
  } else {
    const frame = await readJsonFile<{ assets: string[] }>(path.resolve(framePath));
    totalAssets = frame.assets.length;

    const livenessData = await readJsonFile<Record<string, { status: string; lastSeen?: string }>>(
      path.resolve(livenessDbPath),
    );

    for (const assetId of frame.assets) {
      const entry = livenessData[assetId];
      if (!entry) {
        neverLiveCount++;
      } else if (entry.status === "live") {
        liveCount++;
      } else if (entry.status === "unavailable") {
        unavailableCount++;
      } else {
        neverLiveCount++;
      }
    }

    attritionRate = liveCount > 0 ? unavailableCount / (liveCount + unavailableCount) : 0;

    if (totalAssets === 0) violations.push("availability_frame_empty");
    if (attritionRate > 0.3) warnings.push("high_attrition_rate");
  }
}

await writeReport(
  "availability",
  "availability.json",
  evidenceDir,
  period,
  capsuleId,
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  [],
  { totalAssets, liveCount, unavailableCount, neverLiveCount, attritionRate },
);
