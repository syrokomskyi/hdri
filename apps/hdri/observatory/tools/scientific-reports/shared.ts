/*
<MODULE_CONTRACT>
<purpose>Shared arg parsing and report writing helpers for scientific QC report tools.</purpose>
<non-goals><item>Does not implement domain-specific validation logic — each tool provides its own.</item></non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing shared module contract for Compass-aware maintenance.</item>
  <item>RFC-0107: add --input-manifest and --report-root arg parsing helpers.</item>
  <item>RFC-0109: immutable report revisions — reuse checkedAt for matching input fingerprint, preserve old reports on input changes, idempotent for identical content.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
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

export const argInputManifest = (): string | undefined => arg("--input-manifest");
export const argReportRoot = (): string | undefined => arg("--report-root");

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

export const computeInputFingerprint = (...parts: string[]): string =>
  createHash("sha256").update(parts.join("\0")).digest("hex");

export const writeReport = async (
  reportType: ScientificReportType,
  filename: string,
  evidenceDir: string,
  period: string,
  capsuleId: string,
  inputFingerprint: string,
  status: "pass" | "fail",
  violations: string[] = [],
  warnings: string[] = [],
  hardSuppressions: string[] = [],
  extra: Record<string, unknown> = {},
): Promise<ScientificGateReport> => {
  const targetPath = path.join(evidenceDir, filename);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  // Check for existing report with same fingerprint — reuse checkedAt for idempotency
  let checkedAt = new Date().toISOString();
  try {
    const existingRaw = await fs.readFile(targetPath, "utf8");
    const existing = JSON.parse(existingRaw) as ScientificGateReport;
    if (existing.inputFingerprint === inputFingerprint) {
      // Same fingerprint → reuse checkedAt → content is identical → no-op
      const report: ScientificGateReport = {
        schemaVersion: "1",
        reportType,
        period,
        capsuleId,
        inputFingerprint,
        status,
        checkedAt: existing.checkedAt,
        violations,
        warnings,
        hardSuppressions,
        ...extra,
      };
      const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
      if (existingRaw === reportBytes) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return report;
      }
      // Same fingerprint but different content — should not happen, but preserve old as revision
    } else {
      // Different fingerprint — preserve old report as a prior revision
      const revisionPath = path.join(
        evidenceDir,
        `${filename.replace(/\.json$/, "")}-rev-${existing.inputFingerprint.slice(0, 12)}.json`,
      );
      await fs.rename(targetPath, revisionPath).catch(() => undefined);
    }
  } catch {
    // No existing report — proceed with new write
  }

  const report: ScientificGateReport = {
    schemaVersion: "1",
    reportType,
    period,
    capsuleId,
    inputFingerprint,
    status,
    checkedAt,
    violations,
    warnings,
    hardSuppressions,
    ...extra,
  };
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
