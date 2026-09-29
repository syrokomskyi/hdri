import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  extractBatchIdsFromManifest,
  extractSourceLedgerHead,
  freezeFrame,
  publishFrozenFrameProjection,
  rebuildLedgerHead,
  sealSourceBatch,
  verifyPriorCapsule,
  verifySourceClosure,
  type CapsuleArtifact,
  type PriorCapsuleEntry,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { sealConvertedBaselineCapsule } from "../../tools/preservation/baseline-capsule.js";
import type { BaselineClosureMaterializationReport } from "../../tools/preservation/baseline-closure-materialization.js";

const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const DEVICE_ID = "test-device";
const PERIOD = "2026-q2";
const BATCH_ID = "2026-q2-de-01";
const LEDGER_PREFIX = `artifacts/frame/${DEVICE_ID}/source-ledger`;

const tmpRoots: string[] = [];
afterEach(() => {
  for (const root of tmpRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(path.join(capsulesRoot, DEVICE_ID), { recursive: true, force: true });
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const capsulesRoot = path.join(repoRoot, "apps", "hdri", "capsules");

// The capsule-signing key id must equal the pem-derived id loadVerificationKeys
// computes (<deviceId>-<sha256(pubkey).first16>) so both the direct key map and
// the --keys-dir path resolve the same trusted key.
const buildKey = () => {
  const pair = generateSigningKey();
  const fingerprint = createHash("sha256").update(pair.publicKeyPem).digest("hex").slice(0, 16);
  return { ...pair, signingKeyId: `${DEVICE_ID}-${fingerprint}`, collectorId: DEVICE_ID };
};
type TestKey = ReturnType<typeof buildKey>;

const writeFile = (file: string, content: string | Buffer): { sha256: string; bytes: number } => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  const bytes = fs.readFileSync(file);
  return { sha256: hash(bytes), bytes: bytes.length };
};

// Builds a preserved capsule dir holding a REAL signed source-ledger closure
// (sealSourceBatch + freezeFrame + publishFrozenFrameProjection) plus preserved
// stage products, its own sealed manifest, and a pinning inventory.
const buildPreservedCapsule = async (root: string, key: TestKey) => {
  const preservedRoot = path.join(root, "preserved");
  const ledgerDir = path.join(preservedRoot, LEDGER_PREFIX);
  await sealSourceBatch(
    ledgerDir,
    {
      schemaVersion: "1",
      batchId: BATCH_ID,
      periodAdded: PERIOD,
      batchHash: hash("batch"),
      files: [
        {
          relativePath: "source.csv",
          sha256: hash("source"),
          bytes: 6,
          parserId: "csv",
          parserVersion: "1",
        },
      ],
    },
    key,
  );
  const occurrence = {
    sourceOccurrenceId: "so-test",
    batchId: BATCH_ID,
    periodAdded: "2026-q2" as const,
    provisionalAssetId: "da-test" as const,
    normalisedDomain: "company.example",
    disposition: "assertion" as const,
  };
  const occurrenceBytes = `${JSON.stringify(occurrence)}\n`;
  const occurrenceTemp = path.join(root, "occurrences.ndjson");
  fs.writeFileSync(occurrenceTemp, occurrenceBytes);
  const frame = freezeFrame(PERIOD, [occurrence], {
    ledgerHead: await rebuildLedgerHead(ledgerDir),
    occurrenceProjectionSha256: hash(occurrenceBytes),
  });
  await publishFrozenFrameProjection(ledgerDir, frame, occurrenceTemp, key);

  const artifacts: CapsuleArtifact[] = [];
  const add = (stage: CapsuleArtifact["stage"], uri: string, content: string | Buffer) => {
    const digest = writeFile(path.join(preservedRoot, uri), content);
    artifacts.push({ stage, uri, ...digest });
  };
  for (const relative of [
    `segments/${BATCH_ID}.json`,
    "projections/frame-2026-q2.json",
    "projections/frame-2026-q2.manifest.json",
    "projections/source-occurrences-2026-q2.ndjson",
  ]) {
    const bytes = fs.readFileSync(path.join(ledgerDir, relative));
    artifacts.push({
      stage: "frame",
      uri: `${LEDGER_PREFIX}/${relative}`,
      sha256: hash(bytes),
      bytes: bytes.length,
    });
  }
  add("liveness", `artifacts/liveness/${DEVICE_ID}/liveness.db`, "preserved liveness");
  add("axe", `artifacts/axe/${DEVICE_ID}/axe.db`, "preserved axe");
  add("emit", "artifacts/emit/manifest.json", JSON.stringify({ schemaVersion: 1 }));
  add("emit", "artifacts/emit/observations.ndjson", '{"obs":1}\n');
  add("methodology", "artifacts/methodology/codebook.yaml", "codebook: 1\n");

  const preservedManifest: QuarterCapsule = {
    period: PERIOD,
    capsuleId: "0198f000-0000-7000-8000-000000000000",
    state: "sealed",
    instrumentPlan: [],
    artifacts,
    legacy: true,
  };
  writeFile(
    path.join(preservedRoot, "capsule-manifest.json"),
    `${JSON.stringify(preservedManifest, null, 2)}\n`,
  );

  const inventory = {
    schema: "hdri-preservation-input@1",
    sourceRoots: [preservedRoot],
    entries: artifacts.map((a) => ({
      absolutePath: path.join(preservedRoot, a.uri),
      role: `source-0000/${a.uri}`,
      access: "internal" as const,
      sha256: a.sha256,
      bytes: a.bytes,
    })),
  };
  return { preservedRoot, inventory, frame, artifacts };
};

const buildConvertedBaseline = (root: string): string => {
  const dbPath = path.join(root, "converted", "observatory.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(
    "CREATE TABLE asset_id_map (provisional_id TEXT PRIMARY KEY, canonical_id TEXT NOT NULL, domain TEXT NOT NULL, first_seen TEXT NOT NULL)",
  );
  db.prepare(
    "INSERT INTO asset_id_map (provisional_id, canonical_id, domain, first_seen) VALUES (?, ?, ?, ?)",
  ).run("da-test", "0198f000-0000-7000-8000-0000000000aa", "company.example", "2026-04-01");
  db.close();
  return dbPath;
};

const equalComparison = (domain: string) => ({
  domain,
  status: "equal" as const,
  sourceRows: 1,
  targetRows: 1,
  matchedRows: 1,
  missingRows: 0,
  unexpectedRows: 0,
  differingRows: 0,
  fieldDifferences: {},
  sourceSha256: hash(`source-${domain}`),
  targetSha256: hash(`target-${domain}`),
  differences: [],
  omittedDifferences: 0,
});

const buildReport = (dbPath: string): BaselineClosureMaterializationReport => {
  const bytes = fs.readFileSync(dbPath);
  const snapshot = { uri: "snapshot.db", sha256: hash("snapshot"), bytes: 8 };
  const scope = {
    status: "retained-claim" as const,
    producer: "test-producer",
    device: DEVICE_ID,
    sourceToken: "token",
    signatureUri: "sig.json",
    evidenceUris: [],
  };
  return {
    schema: "hdri-baseline-closure-materialization@1",
    status: "compared-not-admitted",
    manifestSha256: hash("manifest"),
    sourceSnapshots: { observatory: snapshot, harvest: snapshot },
    sourceScopes: { observatory: scope, harvest: scope },
    target: { sha256: hash(bytes), bytes: bytes.length },
    import: {
      runId: "run-test",
      importedAt: "2026-09-21T00:00:00.000Z",
      implementationFingerprint: hash("impl"),
      ontologyVersion: "1",
      codebookVersion: "1",
    },
    methodology: {
      schema: "hdri-baseline-methodology@1",
      status: "parsed-source-bytes-not-producer-authenticated",
      manifestSha256: hash("methodology"),
      ontology: { uri: "ontology.yaml", sha256: hash("ont"), bytes: 3, version: "1" },
      codebook: {
        uri: "codebook.yaml",
        sha256: hash("cb"),
        bytes: 2,
        id: "cb",
        version: "1",
        ontologyRef: "ont",
      },
    },
    observationSemantics: {
      status: "validated-not-authenticated",
      rows: 1,
      ontologyVersions: ["1"],
      ontologyArtifactValidated: true,
    },
    runProvenance: {
      status: "joined-not-authenticated",
      codebookIdProjection: "retained-column-absent-target-null-compared",
    },
    retainedOnlyDomains: [],
    comparisons: {
      identities: equalComparison("identities"),
      pipelineRuns: equalComparison("pipelineRuns"),
      observations: equalComparison("observations"),
      assetStates: equalComparison("assetStates"),
      mappings: equalComparison("mappings"),
      cohorts: equalComparison("cohorts"),
      strata: equalComparison("strata"),
      evidenceReferences: equalComparison("evidenceReferences"),
    },
  };
};

const buildPublicationDir = (root: string): string => {
  const dir = path.join(root, "publication");
  writeFile(path.join(dir, "manifest.json"), JSON.stringify({ period: PERIOD }));
  writeFile(path.join(dir, "overview.json"), JSON.stringify({ slices: 1 }));
  return dir;
};

const sealFixture = async (key: TestKey) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-baseline-capsule-"));
  tmpRoots.push(root);
  const preserved = await buildPreservedCapsule(root, key);
  const convertedBaselinePath = buildConvertedBaseline(root);
  const publicationDir = buildPublicationDir(root);
  const report = buildReport(convertedBaselinePath);
  const capsuleId = "0198f111-0000-7000-8000-0000000000aa";
  const capsuleDir = path.join(root, "capsules", DEVICE_ID, PERIOD, capsuleId);
  const result = await sealConvertedBaselineCapsule({
    capsuleDir,
    preservedCapsuleRoot: preserved.preservedRoot,
    inventory: preserved.inventory,
    convertedBaselinePath,
    publicationDir,
    report,
    identity: { period: PERIOD, capsuleId, deviceId: DEVICE_ID },
    signingKey: key,
  });
  return { root, capsuleDir, capsuleId, preserved, report, result };
};

const readManifest = (capsuleDir: string): QuarterCapsule =>
  JSON.parse(fs.readFileSync(path.join(capsuleDir, "capsule-manifest.json"), "utf8"));

describe("sealConvertedBaselineCapsule (RFC-0129)", () => {
  it("RFC-0129 AC-1: emits a sealed capsule manifest + signature under the capsule dir", async () => {
    const key = buildKey();
    const f = await sealFixture(key);
    expect(fs.existsSync(f.result.manifestPath)).toBe(true);
    expect(fs.existsSync(path.join(f.capsuleDir, "capsule-signature.json"))).toBe(true);
    const capsule = readManifest(f.capsuleDir);
    expect(capsule.state).toBe("sealed");
    expect(capsule.period).toBe(PERIOD);
    expect(capsule.capsuleId).toBe(f.capsuleId);
    expect(capsule.deviceId).toBe(DEVICE_ID);
    expect(capsule.legacy).toBeUndefined();
    expect(capsule.instrumentPlan.every((e) => e.state === "disabled")).toBe(true);
  });

  it("RFC-0129 AC-2: carries the preserved signed ledger closure byte-identical and it verifies", async () => {
    const key = buildKey();
    const f = await sealFixture(key);
    const capsule = readManifest(f.capsuleDir);
    const frameArtifacts = capsule.artifacts.filter((a) => a.stage === "frame");
    expect(frameArtifacts.length).toBe(4);
    for (const artifact of frameArtifacts) {
      const preservedBytes = fs.readFileSync(path.join(f.preserved.preservedRoot, artifact.uri));
      const capsuleBytes = fs.readFileSync(path.join(f.capsuleDir, artifact.uri));
      expect(
        capsuleBytes.equals(preservedBytes),
        `frame artifact ${artifact.uri} must be byte-identical`,
      ).toBe(true);
    }
    const closure = await verifySourceClosure(
      path.join(f.capsuleDir, LEDGER_PREFIX),
      PERIOD,
      new Map([[key.signingKeyId, key]]),
    );
    expect(closure.frame.includedBatchIds).toEqual([BATCH_ID]);
  });

  it("RFC-0129 AC-3: binds the closure materialization report as a qc artifact", async () => {
    const key = buildKey();
    const f = await sealFixture(key);
    const capsule = readManifest(f.capsuleDir);
    const qc = capsule.artifacts.find(
      (a) => a.stage === "qc" && a.uri === "staging/conversion/baseline-closure-report.json",
    );
    expect(qc, "capsule must list the closure report as a qc artifact").toBeDefined();
    const reportBytes = fs.readFileSync(path.join(f.capsuleDir, qc!.uri));
    expect(hash(reportBytes)).toBe(qc!.sha256);
    expect(JSON.parse(reportBytes.toString("utf8")).target.sha256).toBe(f.report.target.sha256);
  });

  it("RFC-0129 AC-4: refuses sealing when a preserved artifact fails inventory verification", async () => {
    const key = buildKey();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-baseline-capsule-tamper-"));
    tmpRoots.push(root);
    const preserved = await buildPreservedCapsule(root, key);
    const tampered = path.join(
      preserved.preservedRoot,
      `artifacts/liveness/${DEVICE_ID}/liveness.db`,
    );
    fs.writeFileSync(tampered, "tampered bytes");
    const convertedBaselinePath = buildConvertedBaseline(root);
    await expect(
      sealConvertedBaselineCapsule({
        capsuleDir: path.join(root, "capsule"),
        preservedCapsuleRoot: preserved.preservedRoot,
        inventory: preserved.inventory,
        convertedBaselinePath,
        publicationDir: buildPublicationDir(root),
        report: buildReport(convertedBaselinePath),
        identity: {
          period: PERIOD,
          capsuleId: "0198f111-0000-7000-8000-0000000000ab",
          deviceId: DEVICE_ID,
        },
        signingKey: key,
      }),
    ).rejects.toThrow(/PRESERVED_ARTIFACT_UNVERIFIED/);
    expect(fs.existsSync(path.join(root, "capsule", "capsule-manifest.json"))).toBe(false);
  });

  it("RFC-0129 AC-4b: refuses sealing when the inventory pin disagrees with the preserved manifest", async () => {
    const key = buildKey();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-baseline-capsule-pin-"));
    tmpRoots.push(root);
    const preserved = await buildPreservedCapsule(root, key);
    const inventory = {
      ...preserved.inventory,
      entries: preserved.inventory.entries.map((e) =>
        e.role.endsWith("liveness.db") ? { ...e, sha256: "0".repeat(64) } : e,
      ),
    };
    const convertedBaselinePath = buildConvertedBaseline(root);
    await expect(
      sealConvertedBaselineCapsule({
        capsuleDir: path.join(root, "capsule"),
        preservedCapsuleRoot: preserved.preservedRoot,
        inventory,
        convertedBaselinePath,
        publicationDir: buildPublicationDir(root),
        report: buildReport(convertedBaselinePath),
        identity: {
          period: PERIOD,
          capsuleId: "0198f111-0000-7000-8000-0000000000ac",
          deviceId: DEVICE_ID,
        },
        signingKey: key,
      }),
    ).rejects.toThrow(/PRESERVED_ARTIFACT_PIN_MISMATCH/);
  });

  it("RFC-0129 AC-5: quarter-init records batchIds, sourceLedgerHead and frameId from the sealed capsule", async () => {
    const key = buildKey();
    const f = await sealFixture(key);
    const keysDir = path.join(f.root, "keys");
    fs.mkdirSync(keysDir, { recursive: true });
    fs.writeFileSync(path.join(keysDir, `${DEVICE_ID}.pem`), key.publicKeyPem);
    const outputPath = path.join(f.root, "prior-capsules.json");
    const stdout = execFileSync(
      "pnpm",
      [
        "--filter",
        "@syrokomskyi/observatory",
        "exec",
        "tsx",
        "-C",
        "@syrokomskyi/source",
        "tools/quarter-init.ts",
        "--predecessor",
        f.result.manifestPath,
        "--period",
        "2026-q4",
        "--capsule-id",
        "0198faaa-0000-7000-8000-000000000001",
        "--output",
        outputPath,
        "--keys-dir",
        keysDir,
        "--json",
      ],
      { encoding: "utf8", timeout: 60000, env: { ...process.env, DEVICE_ID } },
    );
    const recorded = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const entry = recorded.priorCapsules[0];
    expect(entry.batchIds).toEqual([BATCH_ID]);
    expect(entry.sourceLedgerHead).toBe(f.preserved.frame.ledgerHead);
    expect(entry.frameId).toBe("frame-2026-q2.json");
    expect(entry.capsuleId).toBe(f.capsuleId);
    expect(stdout).toContain("2026-q4");
  }, 90000);

  it("RFC-0129 AC-6: verifyPriorCapsule admits the sealed capsule as the 2026-q2 prior", async () => {
    const key = buildKey();
    const f = await sealFixture(key);
    const capsule = readManifest(f.capsuleDir);
    const { ledgerHead, frameId } = await extractSourceLedgerHead(f.capsuleDir, capsule);
    const entry: PriorCapsuleEntry = {
      period: PERIOD,
      capsuleId: f.capsuleId,
      manifestPath: "capsule-manifest.json",
      sourceLedgerHead: ledgerHead,
      frameId,
      batchIds: [...extractBatchIdsFromManifest(capsule)],
    };
    const verified = await verifyPriorCapsule(
      entry,
      f.capsuleDir,
      new Map([[key.signingKeyId, key]]),
    );
    expect(verified.batchIds).toEqual([BATCH_ID]);
    expect(verified.predecessorManifestSha256).toBe(f.result.manifestSha256);
  });
});
