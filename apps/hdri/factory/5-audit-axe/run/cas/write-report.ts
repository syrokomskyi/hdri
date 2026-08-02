/*
<MODULE_CONTRACT>
<purpose>Write audit reports to content-addressable storage (CAS) — this module handles write-report operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not validate report JSON structure.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getReportCasPath } from "../paths.js";

export const writeReportToCas = async (
  tool: string,
  reportJson: string,
): Promise<{ sha256: string; casPath: string }> => {
  const sha256 = createHash("sha256").update(reportJson).digest("hex");
  const casPath = getReportCasPath(tool, sha256);
  await fs.mkdir(path.dirname(casPath), { recursive: true });
  const existingMatches = async (): Promise<boolean> => {
    try {
      return createHash("sha256").update(await fs.readFile(casPath)).digest("hex") === sha256;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  };
  if (await existingMatches()) return { sha256, casPath };
  const temp = `${casPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, reportJson, { encoding: "utf8", flag: "wx" });
  try {
    await fs.link(temp, casPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    await fs.unlink(temp).catch(() => undefined);
  }
  if (!(await existingMatches())) throw new Error(`Audit report CAS collision: ${sha256}`);
  return { sha256, casPath };
};
