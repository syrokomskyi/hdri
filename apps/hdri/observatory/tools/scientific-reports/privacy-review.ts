/*
<MODULE_CONTRACT>
<purpose>Reviews privacy k-anonymity thresholds and disclosure risk across all published products by reading actual file bytes (CSV and JSON).</purpose>
<non-goals><item>Does not apply suppression — reviews and reports status only.</item></non-goals>
</MODULE_CONTRACT>
 * <CHANGE_SUMMARY>
  <item>Document the existing privacy-review module contract for Compass-aware maintenance.</item>
  <item>RFC-0108: replace JSON-only cells reader with actual-byte CSV and JSON array readers. Accept --public-manifest. Produce DisclosureReport with filesChecked, cellsChecked, effectiveK.</item>
</CHANGE_SUMMARY>
*/

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { parse as parseYaml } from "yaml";
import { arg, fileExists, readJsonFile, requireCommonArgs, writeReport } from "./shared";
import type { DisclosureReport } from "../../run/release/release-contract";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const publicManifestPath = arg("--public-manifest");
const policyPath = arg("--policy");

const violations: string[] = [];
const warnings: string[] = [];
const hardSuppressions: string[] = [];

let effectiveK = 12;
let filesChecked = 0;
let cellsChecked = 0;
let suppressedCells = 0;

interface PublicManifestEntry {
  product: string;
  format: "csv" | "json";
  contentSha256: string;
  bytes: number;
}

interface PublicManifest {
  schema: string;
  products: PublicManifestEntry[];
  kAnonymityMin?: number;
  policyDigest?: string;
}

const PROHIBITED_FIELDS = new Set([
  "asset_id",
  "domain",
  "url",
  "email",
  "phone",
  "remediation",
  "score",
]);

function checkCsvCells(content: string, fileName: string, k: number): void {
  const records = parseCsv(content, { columns: true, skip_empty_lines: true }) as Record<
    string,
    string
  >[];
  if (records.length === 0) return;

  const columns = Object.keys(records[0]!);
  for (const col of columns) {
    if (PROHIBITED_FIELDS.has(col)) {
      violations.push(`prohibited_column:${fileName}:${col}`);
    }
  }

  const nCol = columns.find((c) => c === "n" || c === "count");
  if (nCol) {
    for (let i = 0; i < records.length; i++) {
      cellsChecked++;
      const n = Number(records[i]![nCol]);
      if (!Number.isNaN(n) && n < k) {
        violations.push(`k_anon_violation:${fileName}:row_${i}:n_below_${k}`);
      }
    }
  }
}

function checkJsonCells(content: string, fileName: string, k: number): void {
  const parsed: unknown = JSON.parse(content);
  if (Array.isArray(parsed)) {
    for (let i = 0; i < parsed.length; i++) {
      cellsChecked++;
      const row = parsed[i] as Record<string, unknown>;
      const n = row["n"];
      if (typeof n === "number" && n < k) {
        violations.push(`k_anon_violation:${fileName}:item_${i}:n_below_${k}`);
      }
      for (const key of Object.keys(row)) {
        if (PROHIBITED_FIELDS.has(key)) {
          violations.push(`prohibited_field:${fileName}:item_${i}:${key}`);
        }
      }
    }
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as Record<string, unknown>)["cells"])
  ) {
    const cells = (parsed as { cells: { count: number; suppressed: boolean }[] }).cells;
    for (let i = 0; i < cells.length; i++) {
      cellsChecked++;
      const cell = cells[i]!;
      if (cell.suppressed) {
        suppressedCells++;
      } else if (cell.count < k) {
        violations.push(`k_anon_violation:${fileName}:cell_${i}:count_below_${k}`);
      }
    }
  }
}

function checkComplementarySuppression(content: string, fileName: string, k: number): void {
  const records = parseCsv(content, { columns: true, skip_empty_lines: true }) as Record<
    string,
    string
  >[];
  const nCol = records[0]
    ? Object.keys(records[0]).find((c) => c === "n" || c === "count")
    : undefined;
  if (!nCol) return;

  const rowTotals = new Map<string, number>();
  for (const row of records) {
    const axis = row["axis"] ?? row["dimension_id"] ?? "default";
    const n = Number(row[nCol]);
    if (!Number.isNaN(n) && n < k) {
      const current = rowTotals.get(axis) ?? 0;
      rowTotals.set(axis, current + n);
    }
  }
  for (const [axis, total] of rowTotals) {
    if (total > 0 && total < k) {
      violations.push(
        `complementary_suppression_needed:${fileName}:${axis}:total_${total}_below_${k}`,
      );
    }
  }
}

if (!publicManifestPath) {
  violations.push("public_manifest_missing");
} else {
  const manifestResolved = path.resolve(publicManifestPath);
  if (!(await fileExists(manifestResolved))) {
    violations.push("public_manifest_not_found");
  } else {
    const manifest = await readJsonFile<PublicManifest>(manifestResolved);
    if (manifest.kAnonymityMin && typeof manifest.kAnonymityMin === "number") {
      effectiveK = manifest.kAnonymityMin;
    }

    if (policyPath && (await fileExists(path.resolve(policyPath)))) {
      const policyContent = await fs.readFile(path.resolve(policyPath), "utf8");
      const policy = parseYaml(policyContent) as {
        effectiveKMin?: number;
        default_k?: number;
        hard_floor?: number;
      };
      if (typeof policy.effectiveKMin === "number") effectiveK = policy.effectiveKMin;
      else if (typeof policy.default_k === "number") effectiveK = policy.default_k;
    }

    const manifestDir = path.dirname(manifestResolved);

    for (const entry of manifest.products) {
      const filePath = path.join(manifestDir, `${entry.product}.${entry.format}`);
      if (!(await fileExists(filePath))) {
        violations.push(`public_file_not_found:${entry.product}.${entry.format}`);
        continue;
      }

      filesChecked++;
      const content = await fs.readFile(filePath, "utf8");

      if (entry.format === "csv") {
        checkCsvCells(content, `${entry.product}.csv`, effectiveK);
        checkComplementarySuppression(content, `${entry.product}.csv`, effectiveK);
      } else {
        checkJsonCells(content, `${entry.product}.json`, effectiveK);
      }

      const actualHash = crypto.createHash("sha256").update(content, "utf8").digest("hex");
      if (actualHash !== entry.contentSha256) {
        violations.push(`content_hash_mismatch:${entry.product}.${entry.format}`);
      }
    }

    if (filesChecked === 0) {
      warnings.push("no_public_files_inspected");
    }
    if (cellsChecked === 0) {
      violations.push("zero_data_cells_inspected");
    }
  }
}

const manifestContent = publicManifestPath
  ? await fs.readFile(path.resolve(publicManifestPath), "utf8")
  : "";

const disclosureReport: DisclosureReport = {
  schema: "hdri-disclosure-report@1",
  publicManifestSha256: crypto.createHash("sha256").update(manifestContent, "utf8").digest("hex"),
  filesChecked,
  cellsChecked,
  effectiveK,
  status: violations.length === 0 ? "pass" : "fail",
  violations,
};

await writeReport(
  "privacy-disclosure",
  "privacy-disclosure.json",
  evidenceDir,
  period,
  capsuleId,
  violations.length === 0 ? "pass" : "fail",
  violations,
  warnings,
  hardSuppressions,
  { ...disclosureReport },
);
