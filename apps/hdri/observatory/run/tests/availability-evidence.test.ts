import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { generateSigningKey } from "@syrokomskyi/observatory-crypto";
import {
  QuarterExecutionJournal,
  createQuarterCapsuleStaging,
  DEFAULT_INSTRUMENT_PLAN,
  capsuleConfigSha256,
  loadVerifiedQuarterExecution,
  writeExecutionCasObject,
  type WorkKey,
  type QuarterCapsule,
  type CapsuleArtifact,
  type FrozenFrame,
  frozenFrameSha256,
  rebuildLedgerHead,
  sealSourceBatch,
  sealFrameManifest,
} from "@syrokomskyi/factory-core";
import { deriveAvailabilityCandidate } from "../release/availability-candidate";
import { verifyAvailabilitySource } from "../release/availability-source";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const scope = {
  period: "2026-q3" as const,
  capsuleId: "019c0000-0000-7000-8000-000000000001",
  deviceId: "device-a",
};

async function fixture(unavailableStatus = 503) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-availability-"));
  roots.push(root);
  const generated = generateSigningKey();
  const signingKey = {
    ...generated,
    signingKeyId: `device-a-${createHash("sha256").update(generated.publicKeyPem).digest("hex").slice(0, 16)}`,
    collectorId: "device-a",
  };
  const journal = new QuarterExecutionJournal(
    path.join(root, "staging", "execution", "events"),
    capsuleConfigSha256(scope.period, scope.capsuleId, DEFAULT_INSTRUMENT_PLAN),
    signingKey,
  );
  await createQuarterCapsuleStaging(root, scope, DEFAULT_INSTRUMENT_PLAN);
  await journal.initialize("configured", "2026-07-01T00:00:00.000Z");
  const results = [
    { isLive: true, httpStatus: 200, errorCode: null },
    { isLive: false, httpStatus: unavailableStatus, errorCode: null },
    { isLive: false, httpStatus: 403, errorCode: null },
    { isLive: false, httpStatus: null, errorCode: "collector-error" },
  ];
  const keys: WorkKey[] = results.map((_, i) => ({
    period: scope.period,
    capsuleId: scope.capsuleId,
    stageId: "liveness",
    provisionalAssetId: `da-${i}`,
    instrumentVersion: "test-v1",
  }));
  await journal.declareStageTargets({
    stageId: "liveness",
    keys,
    eventId: "targets",
    now: "2026-07-01T00:00:00.100Z",
  });
  const casPaths: string[] = [];
  for (const [i, key] of keys.entries()) {
    const attempt = await journal.begin({
      key,
      attemptId: `attempt-${i}`,
      leaseOwner: scope.deviceId,
      now: "2026-07-01T00:00:01.000Z",
      leaseExpiresAt: "2026-07-01T00:10:00.000Z",
    });
    const evidence = await writeExecutionCasObject(root, {
      schemaVersion: 1,
      stage: "liveness",
      provisionalAssetId: key.provisionalAssetId,
      result: results[i],
    });
    casPaths.push(evidence.path);
    await journal.finish(attempt!, {
      eventId: `finished-${i}`,
      now: "2026-07-01T00:00:02.000Z",
      state: "succeeded",
      resultSha256: evidence.sha256,
    });
  }
  await journal.sealStage({
    stageId: "liveness",
    keys,
    eventId: "sealed",
    now: "2026-07-01T00:00:03.000Z",
    outputArtifacts: [],
  });
  const execution = await loadVerifiedQuarterExecution(
    root,
    ["liveness"],
    new Map([[signingKey.signingKeyId, signingKey]]),
  );
  return { root, execution, casPaths, signingKey };
}

test("CLI writes only a private content-addressed candidate and reuses identical bytes on retry", async () => {
  const { root, signingKey } = await fixture();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-availability-cli-"));
  roots.push(workDir);
  await fs.mkdir(path.join(workDir, "keys"));
  await fs.writeFile(path.join(workDir, "keys", "device-a.pem"), signingKey.publicKeyPem);
  await fs.mkdir(path.join(workDir, "policies"));
  await fs.writeFile(
    path.join(workDir, "policies", "k-anon-policy-v1.yaml"),
    "default_k: 12\nhard_floor: 5\nhigh_risk_release: false\n",
  );
  const run = () =>
    promisify(execFile)(
      process.execPath,
      [
        "--conditions=@syrokomskyi/source",
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(new URL("../../tools/prepare-availability.ts", import.meta.url)),
        "--capsule-dir",
        root,
        "--keys-dir",
        path.join(workDir, "keys"),
      ],
      { cwd: workDir },
    );
  const first = JSON.parse((await run()).stdout);
  expect(first.status).toBe("candidate-not-approved");
  expect(first.cellPrivacy.status).toBe("fail");
  const before = await fs.stat(first.candidatePath);
  const second = JSON.parse((await run()).stdout);
  expect(second).toEqual(first);
  expect((await fs.stat(first.candidatePath)).mtimeMs).toBe(before.mtimeMs);
  expect(await fs.readdir(path.join(workDir, ".output"))).toEqual(["availability-candidates"]);
  expect(await fs.readFile(first.candidatePath, "utf8")).not.toContain("da-0");
});

test("signed target selection produces deterministic counts from authenticated CAS bytes", async () => {
  const { root, execution } = await fixture();
  const result = await deriveAvailabilityCandidate(root, execution, scope, 1);
  expect(result.counts).toEqual({ reachable: 1, unavailable: 1, blocked: 1, indeterminate: 1 });
  expect(result.source.selectedResultSetSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(await deriveAvailabilityCandidate(root, execution, scope, 1)).toEqual(result);
});
test("authenticated selection cannot be reused for a different capsule or device", async () => {
  const { root, execution } = await fixture();
  await expect(
    deriveAvailabilityCandidate(root, execution, { ...scope, capsuleId: "different" }, 1),
  ).rejects.toThrow("SCOPE_MISMATCH");
  await expect(
    deriveAvailabilityCandidate(root, execution, { ...scope, deviceId: "different" }, 1),
  ).rejects.toThrow("SCOPE_MISMATCH");
});
test("changed CAS bytes after authentication fail instead of producing an aggregate", async () => {
  const { root, execution, casPaths } = await fixture();
  await fs.writeFile(casPaths[0]!, "{}\n");
  await expect(deriveAvailabilityCandidate(root, execution, scope, 1)).rejects.toThrow();
});

test("preserves observed nonstandard three-digit status 999 under the frozen outcome policy", async () => {
  const { root, execution } = await fixture(999);
  const result = await deriveAvailabilityCandidate(root, execution, scope, 1);
  expect(result.counts.unavailable).toBe(1);
  expect(result.n).toBe(4);
});
test.each([99, 1000, 503.5])("rejects malformed status %s without discarding its target", async (status) => {
  const { root, execution } = await fixture(status);
  await expect(deriveAvailabilityCandidate(root, execution, scope, 1)).rejects.toThrow("RESULT_INVALID");
});

test("scientific availability CLI derives four outcomes from signed evidence with byte-stable retry and no attrition claim", async () => {
  const { root, signingKey, casPaths } = await fixture();
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-availability-report-")); roots.push(work);
  const keysDir = path.join(work, "keys"); await fs.mkdir(keysDir);
  await fs.writeFile(path.join(keysDir, "device-a.pem"), signingKey.publicKeyPem);
  const policy = path.join(work, "policy.yaml");
  await fs.writeFile(policy, "default_k: 1\nhard_floor: 1\nhigh_risk_release: false\n");
  const evidence = path.join(work, "qc");
  const run = (period = scope.period as string) => promisify(execFile)(process.execPath, [
    "--conditions=@syrokomskyi/source", "--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("../../tools/scientific-reports/availability-report.ts", import.meta.url)),
    "--period", period, "--capsule-id", scope.capsuleId, "--evidence-dir", evidence,
    "--capsule-dir", root, "--keys-dir", keysDir, "--policy", policy,
  ], { cwd: work });
  const report = JSON.parse((await run()).stdout);
  expect(report.status).toBe("pass");
  expect(report.counts).toEqual({ reachable: 1, unavailable: 1, blocked: 1, indeterminate: 1 });
  expect(report.n).toBe(4);
  expect(report.reachableShareOfTargets).toBe(0.25);
  expect(report).not.toHaveProperty("attritionRate");
  expect(report.bindings.policySha256).toBe(createHash("sha256").update(await fs.readFile(policy)).digest("hex"));
  const retained = await fs.readFile(path.join(evidence, "availability.json"), "utf8");
  expect(JSON.parse((await run()).stdout)).toEqual(report);
  await expect(run("2026-q4")).rejects.toThrow();
  expect(await fs.readFile(path.join(evidence, "availability.json"), "utf8")).toBe(retained);
  await fs.writeFile(casPaths[0]!, "{}\n");
  await expect(run()).rejects.toThrow();
  expect(await fs.readFile(path.join(evidence, "availability.json"), "utf8")).toBe(retained);
});

test("scientific availability CLI exits nonzero and records failed small-cell checks", async () => {
  const { root, signingKey } = await fixture();
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-availability-small-report-")); roots.push(work);
  await fs.mkdir(path.join(work, "keys"));
  await fs.writeFile(path.join(work, "keys", "device-a.pem"), signingKey.publicKeyPem);
  await fs.writeFile(path.join(work, "policy.yaml"), "default_k: 12\nhard_floor: 5\nhigh_risk_release: false\n");
  await expect(promisify(execFile)(process.execPath, [
    "--conditions=@syrokomskyi/source", "--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("../../tools/scientific-reports/availability-report.ts", import.meta.url)),
    "--period", scope.period, "--capsule-id", scope.capsuleId, "--evidence-dir", path.join(work, "qc"),
    "--capsule-dir", root, "--keys-dir", path.join(work, "keys"), "--policy", path.join(work, "policy.yaml"),
  ], { cwd: work })).rejects.toThrow();
  const report = JSON.parse(await fs.readFile(path.join(work, "qc", "availability.json"), "utf8"));
  expect(report.status).toBe("fail");
  expect(report.violations).toContain("small_outcome_cell:blocked");
  expect(report.n).toBe(4);
});

async function sourceFixture(candidateIds: readonly `da-${string}`[] = ["da-0", "da-1", "da-2", "da-3"]) {
  const fixtureData = await fixture();
  const { root, signingKey } = fixtureData;
  const prefix = "artifacts/frame/device-a/source-ledger/";
  const ledger = path.join(root, prefix);
  await sealSourceBatch(ledger, { schemaVersion: "1", batchId: "2026-q3-de-01", periodAdded: "2026-q3",
    batchHash: "a".repeat(64), files: [{ relativePath: "source.csv", sha256: "b".repeat(64), bytes: 1,
      parserId: "test", parserVersion: "1" }] }, signingKey);
  const occurrences = `${JSON.stringify({ fixture: "signed bytes, not parser-completeness proof" })}\n`;
  const projectionDir = path.join(ledger, "projections"); await fs.mkdir(projectionDir, { recursive: true });
  await fs.writeFile(path.join(projectionDir, "source-occurrences-2026-q3.ndjson"), occurrences);
  const unsigned = { period: scope.period, candidateIds, includedBatchIds: ["2026-q3-de-01"],
    ledgerHead: await rebuildLedgerHead(ledger),
    occurrenceProjectionSha256: createHash("sha256").update(occurrences).digest("hex") };
  const frame: FrozenFrame = { ...unsigned, frameSha256: frozenFrameSha256(unsigned) };
  await fs.writeFile(path.join(projectionDir, "frame-2026-q3.json"), JSON.stringify(frame));
  await sealFrameManifest(ledger, frame, signingKey);
  const capsule = JSON.parse(await fs.readFile(path.join(root, "capsule-staging.json"), "utf8")) as QuarterCapsule;
  const artifacts: CapsuleArtifact[] = [...capsule.artifacts];
  for (const relative of ["segments/2026-q3-de-01.json", "projections/frame-2026-q3.json",
    "projections/frame-2026-q3.manifest.json", "projections/source-occurrences-2026-q3.ndjson"]) {
    const bytes = await fs.readFile(path.join(ledger, relative));
    artifacts.push({ stage: "frame", uri: prefix + relative, bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return { ...fixtureData, capsule: { ...capsule, artifacts }, ledger, keys: new Map([[signingKey.signingKeyId, signingKey]]) };
}

test("source QC verifies signed closure and exact complete liveness membership", async () => {
  const f = await sourceFixture();
  const result = await verifyAvailabilitySource(f.root, f.capsule, f.execution, f.keys);
  expect(result.candidates).toBe(4);
  expect(result.targets).toBe(4);
  expect(result.includedBatchIds).toEqual(["2026-q3-de-01"]);
  expect(result.artifacts).toHaveLength(4);
  const substituted = { ...f.capsule, artifacts: f.capsule.artifacts.map(entry =>
    entry.uri.endsWith("segments/2026-q3-de-01.json") ? { ...entry, sha256: "0".repeat(64) } : entry) };
  await expect(verifyAvailabilitySource(f.root, substituted, f.execution, f.keys)).rejects.toThrow("ARTIFACT_BINDING_MISMATCH");
});

test("source QC rejects an equally sized but different signed frame population", async () => {
  const f = await sourceFixture(["da-0", "da-1", "da-2", "da-other"]);
  await expect(verifyAvailabilitySource(f.root, f.capsule, f.execution, f.keys)).rejects.toThrow("TARGET_SET_MISMATCH");
});

test("source QC rejects altered occurrence bytes and ambiguous frame declarations", async () => {
  const f = await sourceFixture();
  const manifest = f.capsule.artifacts.find(entry => entry.uri.endsWith(".manifest.json"))!;
  const duplicate = { ...f.capsule, artifacts: [...f.capsule.artifacts, manifest] };
  await expect(verifyAvailabilitySource(f.root, duplicate, f.execution, f.keys)).rejects.toThrow("DECLARATION_AMBIGUOUS");
  await fs.appendFile(path.join(f.ledger, "projections/source-occurrences-2026-q3.ndjson"), "changed\n");
  await expect(verifyAvailabilitySource(f.root, f.capsule, f.execution, f.keys)).rejects.toThrow("occurrence projection mismatch");
});
