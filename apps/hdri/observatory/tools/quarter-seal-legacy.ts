/*
<MODULE_CONTRACT>
<purpose>Seals pre-RFC-0026 quarters that lack execution evidence by building a legacy capsule from existing artifacts.</purpose>
<non-goals>
  <item>Does not fabricate execution evidence (targets, stage seals, CAS objects).</item>
  <item>Does not run the normal EmitBundleGogol / PrepareQuarterReleaseGogol / SealCapsuleGogol pipeline.</item>
  <item>Does not seal quarters that already have capsule-manifest.json.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0045: create legacy quarter sealing tool for pre-RFC-0026 quarters.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  sealQuarterCapsule,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  writeQuarterCapsuleCandidate,
  writeQuarterCapsuleStaging,
  type CapsuleArtifact,
  type InstrumentPlanEntry,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { loadSigningKeyFromEnv } from "@syrokomskyi/observatory-crypto";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const sha256File = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const copyFile = async (src: string, dest: string): Promise<{ sha256: string; bytes: number }> => {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
  const stat = await fs.stat(dest);
  const sha256 = await sha256File(dest);
  return { sha256, bytes: stat.size };
};

const copyDir = async (
  src: string,
  dest: string,
  rootDest: string = dest,
): Promise<{ sha256: string; bytes: number; relativePath: string }[]> => {
  const entries = await fs.readdir(src, { withFileTypes: true });
  const results: { sha256: string; bytes: number; relativePath: string }[] = [];
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await copyDir(srcPath, destPath, rootDest)));
    } else {
      const { sha256, bytes } = await copyFile(srcPath, destPath);
      results.push({ sha256, bytes, relativePath: path.relative(rootDest, destPath) });
    }
  }
  return results;
};

const checkDbIntegrity = async (dbPath: string): Promise<void> => {
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(dbPath, { readonly: true });
  try {
    const result = db.pragma("integrity_check", { simple: true }) as unknown;
    if (result !== "ok" && !Array.isArray(result)) {
      throw new Error(`SQLite integrity_check failed for ${dbPath}: ${JSON.stringify(result)}`);
    }
    if (Array.isArray(result) && result.length > 0 && result[0] !== "ok") {
      throw new Error(`SQLite integrity_check failed for ${dbPath}: ${JSON.stringify(result)}`);
    }
  } finally {
    db.close();
  }
};

const DEVICE_ID = process.env.DEVICE_ID ?? "legacy-device";

async function main(): Promise<void> {
  const period = arg("--period");
  const capsuleId = arg("--capsule-id");
  const capsuleDir = arg("--capsule-dir");
  const emitDir = arg("--emit-dir");
  const coreDb = arg("--core-db");
  const livenessDb = arg("--liveness-db");
  const pagesDb = arg("--pages-db");
  const axeDb = arg("--axe-db");
  const sourceLedgerDir = arg("--source-ledger-dir");
  const ontology = arg("--ontology");
  const codebook = arg("--codebook");
  const force = hasFlag("--force");

  for (const [name, value] of [
    ["--period", period],
    ["--capsule-id", capsuleId],
    ["--capsule-dir", capsuleDir],
    ["--emit-dir", emitDir],
    ["--core-db", coreDb],
    ["--liveness-db", livenessDb],
    ["--pages-db", pagesDb],
    ["--source-ledger-dir", sourceLedgerDir],
  ] as const) {
    if (!value) {
      console.error(`Missing required argument: ${name}`);
      process.exit(1);
    }
  }

  if (!/^\d{4}-q[1-4]$/.test(period!)) {
    console.error(`Invalid period format (expected yyyy-qn): ${period}`);
    process.exit(1);
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(capsuleId!)) {
    console.error(`capsuleId must be a UUID v7: ${capsuleId}`);
    process.exit(1);
  }

  const manifestPath = path.join(capsuleDir!, "capsule-manifest.json");
  if (
    await fs
      .access(manifestPath)
      .then(() => true)
      .catch(() => false)
  ) {
    console.error(
      `capsule-manifest.json already exists in ${capsuleDir} — quarter is already sealed`,
    );
    process.exit(1);
  }

  const stagingPath = path.join(capsuleDir!, "capsule-staging.json");
  if (
    !force &&
    (await fs
      .access(stagingPath)
      .then(() => true)
      .catch(() => false))
  ) {
    console.error(
      `capsule-staging.json already exists in ${capsuleDir} — use --force to overwrite`,
    );
    process.exit(1);
  }

  if (force) {
    await fs.rm(stagingPath, { force: true });
  }

  const dbPaths: { path: string; stage: string; filename: string }[] = [
    { path: livenessDb!, stage: "liveness", filename: "liveness.db" },
    { path: coreDb!, stage: "liveness", filename: "core.db" },
    { path: pagesDb!, stage: "liveness", filename: "pages.db" },
  ];
  if (axeDb) {
    dbPaths.push({ path: axeDb, stage: "axe", filename: "axe.db" });
  }

  for (const db of dbPaths) {
    if (
      !(await fs
        .access(db.path)
        .then(() => true)
        .catch(() => false))
    ) {
      console.error(`DB file not found: ${db.path}`);
      process.exit(1);
    }
    await checkDbIntegrity(db.path);
  }

  const emitManifestPath = path.join(emitDir!, "manifest.json");
  if (
    !(await fs
      .access(emitManifestPath)
      .then(() => true)
      .catch(() => false))
  ) {
    console.error(`Emit bundle manifest.json not found in ${emitDir}`);
    process.exit(1);
  }
  try {
    JSON.parse(await fs.readFile(emitManifestPath, "utf8"));
  } catch {
    console.error(`Emit bundle manifest.json is not valid JSON: ${emitManifestPath}`);
    process.exit(1);
  }

  if (
    !(await fs
      .access(sourceLedgerDir!)
      .then(() => true)
      .catch(() => false))
  ) {
    console.error(`Source ledger directory not found: ${sourceLedgerDir}`);
    process.exit(1);
  }
  const sourceLedgerEntries = await fs.readdir(sourceLedgerDir!);
  if (sourceLedgerEntries.length === 0) {
    console.error(`Source ledger directory is empty: ${sourceLedgerDir}`);
    process.exit(1);
  }

  const artifacts: CapsuleArtifact[] = [];

  for (const db of dbPaths) {
    const destDir = path.join(capsuleDir!, "artifacts", db.stage, DEVICE_ID);
    const destPath = path.join(destDir, db.filename);
    const { sha256, bytes } = await copyFile(db.path, destPath);
    artifacts.push({
      stage: db.stage as CapsuleArtifact["stage"],
      uri: path.relative(capsuleDir!, destPath),
      sha256,
      bytes,
    });
  }

  const emitDestDir = path.join(capsuleDir!, "artifacts", "emit");
  const emitEntries = await fs.readdir(emitDir!);
  for (const entry of emitEntries) {
    const srcPath = path.join(emitDir!, entry);
    const stat = await fs.stat(srcPath);
    if (stat.isFile()) {
      const destPath = path.join(emitDestDir, entry);
      const { sha256, bytes } = await copyFile(srcPath, destPath);
      artifacts.push({
        stage: "emit",
        uri: path.relative(capsuleDir!, destPath),
        sha256,
        bytes,
      });
    }
  }

  const sourceLedgerDestDir = path.join(
    capsuleDir!,
    "artifacts",
    "frame",
    DEVICE_ID,
    "source-ledger",
  );
  const ledgerResults = await copyDir(sourceLedgerDir!, sourceLedgerDestDir);
  for (const result of ledgerResults) {
    artifacts.push({
      stage: "frame",
      uri: path.relative(capsuleDir!, path.join(sourceLedgerDestDir, result.relativePath)),
      sha256: result.sha256,
      bytes: result.bytes,
    });
  }

  if (ontology) {
    const destPath = path.join(capsuleDir!, "artifacts", "methodology", "ontology.json");
    const { sha256, bytes } = await copyFile(ontology, destPath);
    artifacts.push({
      stage: "methodology",
      uri: path.relative(capsuleDir!, destPath),
      sha256,
      bytes,
    });
  }

  if (codebook) {
    const destPath = path.join(capsuleDir!, "artifacts", "methodology", "codebook.yaml");
    const { sha256, bytes } = await copyFile(codebook, destPath);
    artifacts.push({
      stage: "methodology",
      uri: path.relative(capsuleDir!, destPath),
      sha256,
      bytes,
    });
  }

  const instrumentPlan: InstrumentPlanEntry[] = [
    { instrument: "liveness", state: "required", reason: null },
    { instrument: "profile", state: "required", reason: null },
    {
      instrument: "axe",
      state: axeDb ? "required" : "disabled",
      reason: axeDb ? null : "Legacy quarter — no axe data",
    },
    { instrument: "lighthouse", state: "disabled", reason: "Legacy quarter — no Lighthouse data" },
  ];

  const stagingCapsule: QuarterCapsule = {
    period: period!,
    capsuleId: capsuleId!,
    state: "staging",
    instrumentPlan,
    artifacts,
    legacy: true,
  };

  await writeQuarterCapsuleStaging(capsuleDir!, stagingCapsule);

  const candidateCapsule: QuarterCapsule = { ...stagingCapsule, state: "candidate" };
  await writeQuarterCapsuleCandidate(capsuleDir!, candidateCapsule);

  const signingKey = loadSigningKeyFromEnv();
  const sealedCapsule: QuarterCapsule = { ...stagingCapsule, state: "sealed" };
  await sealQuarterCapsule(capsuleDir!, sealedCapsule, signingKey);

  await verifyQuarterCapsuleArtifacts(capsuleDir!, sealedCapsule);

  const signature = JSON.parse(
    await fs.readFile(path.join(capsuleDir!, "capsule-signature.json"), "utf8"),
  ) as Parameters<typeof verifyQuarterCapsuleSignature>[1];
  if (!verifyQuarterCapsuleSignature(sealedCapsule, signature, signingKey)) {
    throw new Error("Post-seal signature verification failed");
  }

  const warnings = [
    "This capsule has NO execution evidence.",
    "Frozen targets, signed stage seals, and CAS objects are not available.",
  ];

  for (const warning of warnings) {
    console.warn(`[WARN] ${warning}`);
  }

  const output = {
    command: "hdri.quarter.seal-legacy",
    status: "pass" as const,
    period: period!,
    capsuleId: capsuleId!,
    state: "sealed" as const,
    legacy: true,
    artifactsSealed: artifacts.length,
    warnings,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
