/*
<MODULE_CONTRACT>
<purpose>Shared arg parsing and report writing helpers for scientific QC report tools.</purpose>
<non-goals><item>Does not implement domain-specific validation logic — each tool provides its own.</item></non-goals>
</MODULE_CONTRACT>
*/

import fs from "node:fs/promises";
import path from "node:path";
import type {
  ScientificGateReport,
  ScientificReportType,
} from "../../run/release/release-contract";

export const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

export const requireArg = (name: string): string => {
  const value = arg(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const requireCommonArgs = (): {
  period: string;
  capsuleId: string;
  evidenceDir: string;
} => ({
  period: requireArg("--period"),
  capsuleId: requireArg("--capsule-id"),
  evidenceDir: path.resolve(requireArg("--evidence-dir")),
});

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const readJsonFile = async <T>(filePath: string): Promise<T> => {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
};

export const writeReport = async (
  reportType: ScientificReportType,
  filename: string,
  evidenceDir: string,
  period: string,
  capsuleId: string,
  status: "pass" | "fail",
  violations: string[] = [],
  warnings: string[] = [],
  hardSuppressions: string[] = [],
  extra: Record<string, unknown> = {},
): Promise<ScientificGateReport> => {
  const report: ScientificGateReport = {
    schemaVersion: "1",
    reportType,
    period,
    capsuleId,
    status,
    checkedAt: new Date().toISOString(),
    violations,
    warnings,
    hardSuppressions,
    ...extra,
  };
  const targetPath = path.join(evidenceDir, filename);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
  try {
    await fs.writeFile(targetPath, reportBytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await fs.readFile(targetPath, "utf8");
    if (existing !== reportBytes) {
      throw new Error(`Scientific report already exists with different content: ${filename}`);
    }
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
};
