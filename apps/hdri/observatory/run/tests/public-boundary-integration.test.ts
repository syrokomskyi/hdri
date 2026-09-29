import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  checkComplementarySuppression,
  type ProductDisclosureEntry,
} from "../release/release-contract";

describe("AC-2: public boundary integration — complementary disclosure attack", () => {
  let root: string;
  let publicDir: string;
  let priorArchiveDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-public-boundary-"));
    publicDir = path.join(root, "public");
    priorArchiveDir = path.join(root, "public-archive", "2026-q2");
    await fs.mkdir(publicDir, { recursive: true });
    await fs.mkdir(priorArchiveDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("prior public manifest is preserved when suppression check fails", async () => {
    // Write prior public manifest
    const priorManifest = {
      schema: "hdri-public-manifest@1",
      products: [
        {
          schema: "hdri-public-product@1",
          product: "cross-section",
          format: "csv",
          contentSha256: "prior-csv-hash",
          bytes: 100,
          policySha256: "policy-hash",
          schemaId: "hdri-public-product@1",
          sourceAggregateSha256: "agg-hash",
        },
      ],
      kAnonymityMin: 5,
      policyDigest: "policy-hash",
    };
    const priorManifestPath = path.join(priorArchiveDir, "public-manifest.json");
    await fs.writeFile(priorManifestPath, JSON.stringify(priorManifest, null, 2));

    // A genuine count inconsistency must fail even while the sample expands.
    const currentProducts: ProductDisclosureEntry[] = [
      { product: "cross-section", format: "csv", contentSha256: "new-hash", n: 200 },
      { product: "cross-section", format: "json", contentSha256: "new-json-hash", n: 199 },
    ];
    const result = checkComplementarySuppression(currentProducts, 5);

    expect(result.status).toBe("fail");
    expect(result.crossFormatMismatches).toHaveLength(1);
    expect(result.crossQuarterAssessment).toBe("not-assessed");

    // Prior manifest must still exist and be unchanged
    const priorContent = await fs.readFile(priorManifestPath, "utf8");
    const priorParsed = JSON.parse(priorContent);
    expect(priorParsed.products[0].contentSha256).toBe("prior-csv-hash");

    // No new public manifest should have been written
    const currentManifestPath = path.join(publicDir, "public-manifest.json");
    try {
      await fs.access(currentManifestPath);
      throw new Error("Public manifest should not exist when suppression check fails");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  });

  it("public manifest is written when suppression check passes", async () => {
    const currentProducts: ProductDisclosureEntry[] = [
      { product: "cross-section", format: "csv", contentSha256: "a".repeat(64), n: 100 },
      { product: "cross-section", format: "json", contentSha256: "b".repeat(64), n: 100 },
    ];
    const result = checkComplementarySuppression(currentProducts, 5);

    expect(result.status).toBe("pass");

    // Simulate writing the public manifest
    const manifest = {
      schema: "hdri-public-manifest@1",
      products: currentProducts.map((p) => ({
        schema: "hdri-public-product@1",
        product: p.product,
        format: p.format,
        contentSha256: p.contentSha256,
        bytes: 100,
        policySha256: "policy-hash",
        schemaId: "hdri-public-product@1",
        sourceAggregateSha256: "agg-hash",
      })),
      kAnonymityMin: 5,
      policyDigest: "policy-hash",
    };
    const manifestPath = path.join(publicDir, "public-manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const written = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    expect(written.products).toHaveLength(2);
  });
});
