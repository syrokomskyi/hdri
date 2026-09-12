/*
<MODULE_CONTRACT>
<purpose>Exports allowlisted public products from observatory aggregates with k-anonymity suppression and typed PublicProductRef manifest.</purpose>
<non-goals>
  <item>Does not export asset-level identifiers, domains, URLs, emails, phones, or free-text remediation.</item>
  <item>Does not compute scores or aggregates — reads from existing observatory DB.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0108: create public product exporter with allowlisted aggregate schema, k-anon suppression, and PublicProductRef manifest.</item>
</CHANGE_SUMMARY>
*/

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import { parsePeriod } from "@syrokomskyi/observatory-core";
import { createJsonLogger } from "@warpgogol/pipeline-core";
import { loadKAnonPolicy } from "../../tools/k-anon-policy";
import { Gogol } from "../pipeline/Gogol";
import type { PipelineContext } from "../pipeline/types";
import { openObservatoryDb } from "../db/connection";
import { outputRootDir } from "../config";
import type { PublicProductRef } from "../release/release-contract";

type AggRow = {
  axis: string | null;
  axis_value: string | null;
  stat_type: string;
  dimension_id: string | null;
  n: number;
  mean: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  min_val: number | null;
  max_val: number | null;
};

const PROHIBITED_COLUMNS = new Set([
  "asset_id",
  "domain",
  "url",
  "email",
  "phone",
  "remediation",
  "score",
]);

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export class ExportPublicProductsGogol extends Gogol {
  override readonly id = "export-public-products";

  override async validateBeforeStart(ctx: PipelineContext): Promise<void> {
    if (!ctx.state.runId) {
      throw new Error("Missing run_id");
    }
  }

  override async run(ctx: PipelineContext): Promise<void> {
    const policy = await loadKAnonPolicy();
    const kAnonymityMin = policy.effective_k_min;
    const publicDir = path.join(outputRootDir, "public");
    await fs.mkdir(publicDir, { recursive: true });
    const log = createJsonLogger({
      app: "observatory",
      pipeline: "observatory",
    }).withContext({ gogol: this.id });

    const year = parsePeriod(ctx.state.brief.period).year;
    const db = openObservatoryDb(year);
    const refs: PublicProductRef[] = [];
    const policyDigest = crypto
      .createHash("sha256")
      .update(`${policy.default_k}:${policy.hard_floor}:${policy.high_risk_release}`)
      .digest("hex");

    try {
      const cohortId = ctx.state.cohortId;
      if (!cohortId) {
        throw new Error("Cannot export public products without cohort ID");
      }

      const aggRows = db
        .prepare(
          `
        SELECT axis, axis_value, stat_type, dimension_id, n, mean, p10, p25, p50, p75, p90, min_val, max_val
        FROM cohort_aggregates
        WHERE cohort_id = ?
      `,
        )
        .all(cohortId) as AggRow[];

      const publicAggs = aggRows.filter((r) => r.n >= kAnonymityMin);
      const suppressedCount = aggRows.length - publicAggs.length;

      for (const row of publicAggs) {
        for (const key of Object.keys(row) as (keyof AggRow)[]) {
          if (PROHIBITED_COLUMNS.has(key as string)) {
            throw new Error(`prohibited_column_in_public_product: ${String(key)}`);
          }
        }
      }

      const csvPath = path.join(publicDir, "cross-section.csv");
      const csvContent = stringify(publicAggs, {
        header: true,
        columns: [
          "axis",
          "axis_value",
          "stat_type",
          "dimension_id",
          "n",
          "mean",
          "p10",
          "p25",
          "p50",
          "p75",
          "p90",
          "min_val",
          "max_val",
        ],
      });
      await fs.writeFile(csvPath, csvContent, "utf-8");
      const csvStat = await fs.stat(csvPath);
      refs.push({
        schema: "hdri-public-product@1",
        product: "cross-section",
        format: "csv",
        contentSha256: hashContent(csvContent),
        bytes: csvStat.size,
        policySha256: policyDigest,
        schemaId: "hdri-public-product@1",
        sourceAggregateSha256: hashContent(JSON.stringify(aggRows)),
      });

      const jsonPath = path.join(publicDir, "cross-section.json");
      const jsonContent = JSON.stringify(publicAggs, null, 2);
      await fs.writeFile(jsonPath, jsonContent, "utf-8");
      const jsonStat = await fs.stat(jsonPath);
      refs.push({
        schema: "hdri-public-product@1",
        product: "cross-section",
        format: "json",
        contentSha256: hashContent(jsonContent),
        bytes: jsonStat.size,
        policySha256: policyDigest,
        schemaId: "hdri-public-product@1",
        sourceAggregateSha256: hashContent(JSON.stringify(aggRows)),
      });

      log.info("public-export-finished", `Exported ${refs.length} public products`, {
        publicDir,
        suppressedCount,
        kAnonymityMin,
      });
    } finally {
      db.close();
    }

    const manifest = {
      schema: "hdri-public-manifest@1",
      products: refs,
      kAnonymityMin,
      policyDigest,
    };

    const manifestPath = path.join(publicDir, "public-manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    ctx.state.publicManifestPath = manifestPath;
    ctx.state.martPaths = (ctx.state.martPaths ?? []).concat(
      refs.map((r) => {
        const ext = r.format === "csv" ? "csv" : "json";
        return path.join(publicDir, `${r.product}.${ext}`);
      }),
    );
  }
}
