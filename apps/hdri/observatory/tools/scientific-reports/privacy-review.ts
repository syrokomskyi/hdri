/*
<MODULE_CONTRACT>
<purpose>Reviews privacy k-anonymity thresholds and disclosure risk across all published products.</purpose>
<non-goals><item>Does not apply suppression — reviews and reports status only.</item></non-goals>
</MODULE_CONTRACT>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { arg, fileExists, readJsonFile, requireCommonArgs, writeReport } from "./shared";

const { period, capsuleId, evidenceDir } = requireCommonArgs();
const productsDir = arg("--products-dir");
const policyPath = arg("--policy");

const violations: string[] = [];
const warnings: string[] = [];
const hardSuppressions: string[] = [];

let effectiveKMin = 12;
let suppressedCells = 0;
let totalCells = 0;

if (!productsDir) {
  violations.push("products_dir_missing");
} else {
  const productsPath = path.resolve(productsDir);
  if (!(await fileExists(productsPath))) {
    violations.push("products_dir_not_found");
  } else {
    if (policyPath && (await fileExists(path.resolve(policyPath)))) {
      const policyContent = await fs.readFile(path.resolve(policyPath), "utf8");
      const policy = parseYaml(policyContent) as { effectiveKMin?: number; hardFloor?: number };
      if (typeof policy.effectiveKMin === "number") effectiveKMin = policy.effectiveKMin;
    }

    const entries = await fs.readdir(productsPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const productPath = path.join(productsPath, entry.name);
      const product = await readJsonFile<{
        cells?: { count: number; suppressed: boolean }[];
      }>(productPath);
      if (product.cells) {
        for (const cell of product.cells) {
          totalCells++;
          if (cell.suppressed) suppressedCells++;
          if (!cell.suppressed && cell.count < effectiveKMin) {
            violations.push(`k_anon_violation:${entry.name}:count_below_${effectiveKMin}`);
          }
        }
      }
    }

    if (totalCells === 0) warnings.push("no_product_cells_found");
  }
}

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
  { effectiveKMin, suppressedCells, totalCells },
);
