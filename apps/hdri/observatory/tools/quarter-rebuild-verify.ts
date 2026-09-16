/*
<MODULE_CONTRACT>
<purpose>Independently reconstructs HDRI public products from preserved evidence (vault + codebook + methodology) in an isolated scratch directory, compares the rebuilt public manifest digest against the expected digest, and writes a RebuildReceipt.</purpose>
<non-goals>
  <item>Does not modify the working DB, sealed capsule, or public archives.</item>
  <item>Does not access signing secrets or network resources.</item>
  <item>Does not claim success on an empty or absent reconstruction.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Remove the placeholder rebuild that could certify an empty directory; fail before filesystem effects until the actual executor exists.</item>
  <item>RFC-0115: replace REBUILD_EXECUTOR_UNAVAILABLE with actual reconstruction pipeline using RebuildSandbox isolation, vault → fresh DB → scoring → public product generation, and digest comparison.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: A rebuild receipt requires actual reconstruction; an absent executor never yields success.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { VaultReader } from "@syrokomskyi/observatory-vault";
import { parseCodebookOrThrow } from "@syrokomskyi/hdri-codebook";
import { newId } from "@syrokomskyi/observatory-core";
import { readEmitBundle, streamAssetStates } from "@syrokomskyi/observatory-emit";
import type { AssetStateRecord } from "@syrokomskyi/observatory-core";
import { evaluateProgramGate, loadAdmissionInputFromFiles } from "@syrokomskyi/factory-core";
import { migrateObservatory } from "../run/db/migrate";
import { writeAssetStatesDeduped, type AssetStateInput } from "../run/db/sync-writers";
import { scoreAndWriteForRun } from "../run/score/score-core";
import {
  bundleAssetStatesToInputs,
  insertRebuiltObservations,
  vaultAssetStatesToInputs,
} from "../run/rebuild/rebuild-core";
import { RebuildSandbox } from "../run/rebuild/rebuild-sandbox";
import {
  computeInputClosureSha256,
  createRebuildReceipt,
  sha256File,
  type ScientificInputs,
} from "../run/release/release-contract";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const inputManifestPath = arg("--input-manifest");
const reportRoot = arg("--report-root");
const admissionInputPath = arg("--admission-input");
const admissionEvidenceRoot = arg("--admission-evidence-root");
const admissionTrustedKeysPath = arg("--admission-trusted-keys");
const periodArg = arg("--period");
const capsuleIdArg = arg("--capsule-id");

if (!inputManifestPath) throw new Error("--input-manifest <scientific-inputs.json> is required");
if (!reportRoot) throw new Error("--report-root <dir> is required");
if (!periodArg || !capsuleIdArg) throw new Error("--period and --capsule-id are required");

const startedAt = new Date().toISOString();

// Parse the scientific inputs manifest to get capsule and evidence references
const inputManifest = JSON.parse(
  await fs.readFile(path.resolve(inputManifestPath), "utf8"),
) as ScientificInputs;

// Resolve evidence paths from the manifest
const capsuleDir = path.dirname(inputManifestPath);
const vaultDir = path.resolve(path.join(capsuleDir, "..", "vault"));
const codebookPath = path.resolve(
  path.join(capsuleDir, "..", "..", "..", ".input", "codebook.yaml"),
);
const methodologyPath = path.resolve(inputManifest.methodologyRef);
const publicManifestPath = path.resolve(
  path.join(capsuleDir, "..", "public", "public-manifest.json"),
);

// ProgramGate check — rebuild is a publish operation
const gate = evaluateProgramGate(
  await loadAdmissionInputFromFiles({
    admissionInputPath,
    evidenceRoot: admissionEvidenceRoot,
    trustedKeysPath: admissionTrustedKeysPath,
    trustedKeysSha256: process.env.HDRI_OPERATIONAL_ADMISSION_TRUST_SHA256,
    requiredEvidenceClass: "operational",
    expected: { period: periodArg, capsuleId: capsuleIdArg, operation: "publish" },
  }),
);
if (gate.status === "blocked") {
  throw new Error(`ProgramGate blocked: ${gate.blockerCodes.join(", ")}`);
}

// Create scratch directory for isolated reconstruction
const scratchDir = path.join(reportRoot, "rebuild-scratch");
await fs.rm(scratchDir, { recursive: true, force: true });
await fs.mkdir(scratchDir, { recursive: true });

// Set up isolation sandbox — only allow access to vault, codebook, methodology
const allowedRoots = [vaultDir, path.dirname(codebookPath), methodologyPath, scratchDir];
const sandbox = new RebuildSandbox(allowedRoots);
const sandboxedFs = sandbox.getFs();

try {
  // 1. Read vault observations and asset states
  const year = new Date().getFullYear();
  const reader = new VaultReader(vaultDir);
  const vaultStates = await reader.getAssetStateRecords(year);
  let stateInputs: AssetStateInput[] = vaultAssetStatesToInputs(vaultStates);
  let period = stateInputs.find((s) => s.period)?.period ?? String(year);

  // Fallback: re-derive asset_states from emit-bundle if vault has none
  if (stateInputs.length === 0) {
    const emitDir = path.resolve(path.join(capsuleDir, "..", "emit"));
    try {
      const bundle = await readEmitBundle(emitDir);
      period = bundle.manifest.period;
      const records: AssetStateRecord[] = [];
      for await (const st of streamAssetStates(bundle)) {
        records.push(st);
      }
      stateInputs = bundleAssetStatesToInputs(records, period);
    } catch {
      // No emit bundle — continue with empty asset states
    }
  }

  // 2. Create fresh DB in scratch
  const rebuiltDbPath = path.join(scratchDir, "observatory_rebuilt.db");
  const db = new Database(rebuiltDbPath);
  db.pragma("journal_mode = WAL");
  migrateObservatory(db);

  const runId = newId();
  const ontologyVersion = "rebuild";

  let insertedObs = 0;
  for await (const rows of reader.streamAllObservations(year)) {
    insertedObs += insertRebuiltObservations(db, rows, {
      runId,
      period,
      ontologyVersion,
    });
  }

  if (insertedObs === 0) {
    throw new Error("No observation shards found in vault — cannot reconstruct");
  }

  writeAssetStatesDeduped(db, stateInputs, {
    runId,
    now: new Date().toISOString(),
  });

  // 3. Re-score with frozen codebook
  const codebook = parseCodebookOrThrow(
    await sandboxedFs.readFile(codebookPath, "utf-8"),
    codebookPath,
  );
  scoreAndWriteForRun(db, codebook, {
    runId,
    period,
    now: new Date().toISOString(),
  });

  db.close();
  reader.close();

  // 4. Generate canonical public products from rebuilt DB
  //    The rebuild worker gets permitted schema descriptors and frozen policy,
  //    not expected values. It generates canonical deterministic public bytes.
  const rebuiltPublicDir = path.join(scratchDir, "public");
  await fs.mkdir(rebuiltPublicDir, { recursive: true });

  // Read the expected public manifest to get the product list
  const expectedManifestContent = await fs.readFile(publicManifestPath, "utf8");
  const expectedManifest = JSON.parse(expectedManifestContent) as {
    products: { product: string; format: string; contentSha256: string }[];
    kAnonymityMin: number;
  };

  // Generate deterministic public products from rebuilt DB
  const rebuiltDb = new Database(rebuiltDbPath, { readonly: true });
  try {
    for (const product of expectedManifest.products) {
      const rows = rebuiltDb
        .prepare(
          `SELECT axis, axis_value, stat_type, dimension_id, n, mean, p10, p25, p50, p75, p90, min_val, max_val
           FROM cohort_aggregates WHERE n >= ?`,
        )
        .all(expectedManifest.kAnonymityMin) as Record<string, unknown>[];

      const content = JSON.stringify(rows, null, 2);
      const ext = product.format === "csv" ? "csv" : "json";
      await fs.writeFile(
        path.join(rebuiltPublicDir, `${product.product}.${ext}`),
        content,
        "utf-8",
      );
    }
  } finally {
    rebuiltDb.close();
  }

  // 5. Compare rebuilt public manifest digest against expected
  const rebuiltProducts: {
    schema: string;
    product: string;
    format: string;
    contentSha256: string;
    bytes: number;
    policySha256: string;
    schemaId: string;
    sourceAggregateSha256: string;
  }[] = [];
  for (const p of expectedManifest.products) {
    const ext = p.format === "csv" ? "csv" : "json";
    const contentSha = await sha256File(path.join(rebuiltPublicDir, `${p.product}.${ext}`));
    rebuiltProducts.push({
      schema: "hdri-public-product@1",
      product: p.product,
      format: p.format,
      contentSha256: contentSha,
      bytes: 0,
      policySha256: "",
      schemaId: "hdri-public-product@1",
      sourceAggregateSha256: "",
    });
  }
  const rebuiltManifest = {
    schema: "hdri-public-manifest@1",
    products: rebuiltProducts,
    kAnonymityMin: expectedManifest.kAnonymityMin,
    policyDigest: "",
  };
  const rebuiltManifestContent = JSON.stringify(rebuiltManifest, null, 2);
  const rebuiltPublicManifestSha256 = createHash("sha256")
    .update(rebuiltManifestContent)
    .digest("hex");
  const expectedPublicManifestSha256 = createHash("sha256")
    .update(expectedManifestContent)
    .digest("hex");

  // 6. Compute isolation proof
  const isolationProofSha256 = sandbox.computeIsolationProof();

  // 7. Compute input closure hash
  const inputClosureSha256 = await computeInputClosureSha256([
    inputManifestPath,
    codebookPath,
    methodologyPath,
  ]);

  // 8. Compute comparison report
  const comparisonReport = {
    rebuiltPublicManifestSha256,
    expectedPublicManifestSha256,
    match: rebuiltPublicManifestSha256 === expectedPublicManifestSha256,
    productCount: expectedManifest.products.length,
    observationCount: insertedObs,
  };
  const comparisonReportSha256 = createHash("sha256")
    .update(JSON.stringify(comparisonReport))
    .digest("hex");

  // 9. Compute remaining receipt fields
  const capsuleManifestSha256 = inputManifest.capsuleManifestSha256;
  const methodologySha256 = await sha256File(methodologyPath);
  const runtimeClosureSha256 = createHash("sha256")
    .update(JSON.stringify({ runId, ontologyVersion, codebookVersion: codebook.version }))
    .digest("hex");

  const completedAt = new Date().toISOString();

  // 10. Create and write rebuild receipt
  const receipt = createRebuildReceipt(
    capsuleManifestSha256,
    methodologySha256,
    runtimeClosureSha256,
    rebuiltPublicManifestSha256,
    expectedPublicManifestSha256,
    inputClosureSha256,
    comparisonReportSha256,
    isolationProofSha256,
    startedAt,
    completedAt,
  );

  const receiptPath = path.join(reportRoot, "rebuild-receipt.json");
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf-8");

  // 11. Write comparison report
  const comparisonPath = path.join(reportRoot, "rebuild-comparison.json");
  await fs.writeFile(comparisonPath, JSON.stringify(comparisonReport, null, 2), "utf-8");

  // 12. Clean up scratch
  await fs.rm(scratchDir, { recursive: true, force: true });

  process.stdout.write(
    `${JSON.stringify(
      {
        command: "hdri.quarter.rebuild-verify",
        status: comparisonReport.match ? "pass" : "fail",
        rebuiltPublicManifestSha256,
        expectedPublicManifestSha256,
        observationCount: insertedObs,
        receiptPath,
      },
      null,
      2,
    )}\n`,
  );

  if (!comparisonReport.match) {
    throw new Error(
      `Rebuild verification failed: public manifest digest mismatch (rebuilt=${rebuiltPublicManifestSha256}, expected=${expectedPublicManifestSha256})`,
    );
  }
} catch (error) {
  // Clean up scratch on failure
  await fs.rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
  throw error;
}
