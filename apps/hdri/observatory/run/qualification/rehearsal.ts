/*
<MODULE_CONTRACT>
  <purpose>Execute declared offline qualification adapters and preserve verified outputs across interrupted runs.</purpose>
  <non-goals>
    <item>Does not substitute fixture adapters for missing production collectors or authorize live collection.</item>
    <item>Does not create operational qualification from stage names or a successful subprocess exit alone.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 review: replace synthetic stage completion with isolated producers, independent verifiers and byte-bound resume.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: Every reused stage must retain the same inputs, verification receipt and output bytes.

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  digestDirectory,
  digestFile,
  digestValue,
  runIsolatedProcess,
} from "@warpgogol/pipeline-node";
import { QUALIFICATION_STAGES, REFERENCE_PROFILE_LIMITS } from "@syrokomskyi/observatory-emit";
import { FAULT_BOUNDARIES, FAULT_EXIT_CODE, type FaultBoundary } from "./adapters/common.js";

interface StageAdapter {
  stage: string;
  producer: string;
  verifier: string;
  outputs: string[];
  /** Deterministic failpoint this stage's producer acknowledges when scheduled. */
  faultBoundary?: FaultBoundary;
}

interface RehearsalProfile {
  schema: "hdri-rehearsal-profile@1";
  runtimeRoot: string;
  fixtureRoot: string;
  /** Frozen browser closure mounted read-only at /runtime/browsers. */
  browserRoot?: string;
  stages: StageAdapter[];
  comparisonFiles: string[];
  stageTimeoutMs: number;
}

interface FileProof {
  uri: string;
  bytes: number;
  sha256: string;
}
interface StageResult {
  stage: string;
  inputFingerprint: string;
  consumedSha256: string;
  outputs: FileProof[];
  execution: FileProof;
  verification: FileProof;
  samples: FileProof[];
}
interface FaultRecord {
  stage: string;
  boundary: string;
  attempt: number;
  /** Proof of the preserved fault acknowledgement under receipts/. */
  receipt: FileProof;
}
interface RunManifest {
  schema: "hdri-rehearsal-run@1";
  inputFingerprint: string;
  targets: number;
  profileSha256: string;
  runtimeSha256: string;
  fixtureSha256: string;
  nodeSha256: string;
  browserSha256: string | null;
  browserSlots: number;
  stages: StageResult[];
  faults: FaultRecord[];
  peakWorkBytes: number;
  peakWorkFiles: number;
  status: "running" | "interrupted" | "complete";
  selectedProjectionSha256: string | null;
  comparison: { inputFingerprint: string; selectedProjectionSha256: string; match: true } | null;
  operationallyQualified: boolean;
  elapsedMs: number;
}

function record(input: unknown, name: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error(`INVALID_${name}`);
  return input as Record<string, unknown>;
}
function relativeFile(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error("UNSAFE_REHEARSAL_PATH");
  }
  return value;
}
function exactFields(input: Record<string, unknown>, fields: string[]): void {
  if (Object.keys(input).some((field) => !fields.includes(field)))
    throw new Error("UNKNOWN_REHEARSAL_FIELD");
}
function parseProfile(raw: unknown): RehearsalProfile {
  const input = record(raw, "REHEARSAL_PROFILE");
  exactFields(input, [
    "schema",
    "runtimeRoot",
    "fixtureRoot",
    "browserRoot",
    "stages",
    "comparisonFiles",
    "stageTimeoutMs",
  ]);
  if (input.schema !== "hdri-rehearsal-profile@1") throw new Error("INVALID_REHEARSAL_SCHEMA");
  if (
    typeof input.runtimeRoot !== "string" ||
    !path.isAbsolute(input.runtimeRoot) ||
    typeof input.fixtureRoot !== "string" ||
    !path.isAbsolute(input.fixtureRoot)
  )
    throw new Error("EXPLICIT_REHEARSAL_ROOTS_REQUIRED");
  if (
    typeof input.stageTimeoutMs !== "number" ||
    !Number.isSafeInteger(input.stageTimeoutMs) ||
    input.stageTimeoutMs <= 0 ||
    input.stageTimeoutMs > REFERENCE_PROFILE_LIMITS.maxDurationMs
  )
    throw new Error("INVALID_STAGE_DEADLINE");
  if (
    input.browserRoot !== undefined &&
    (typeof input.browserRoot !== "string" || !path.isAbsolute(input.browserRoot))
  )
    throw new Error("EXPLICIT_REHEARSAL_ROOTS_REQUIRED");
  if (!Array.isArray(input.stages)) throw new Error("MISSING_STAGE_ADAPTERS");
  const stages = input.stages.map((rawStage) => {
    const stage = record(rawStage, "STAGE_ADAPTER");
    exactFields(stage, ["stage", "producer", "verifier", "outputs", "faultBoundary"]);
    if (typeof stage.stage !== "string" || !Array.isArray(stage.outputs) || !stage.outputs.length)
      throw new Error("INVALID_STAGE_ADAPTER");
    if (
      stage.faultBoundary !== undefined &&
      !FAULT_BOUNDARIES.includes(stage.faultBoundary as FaultBoundary)
    )
      throw new Error(`INVALID_FAULT_BOUNDARY:${String(stage.faultBoundary)}`);
    return {
      stage: stage.stage,
      producer: relativeFile(stage.producer),
      verifier: relativeFile(stage.verifier),
      outputs: stage.outputs.map(relativeFile),
      // undefined values are not fingerprintable — omit the key entirely.
      ...(stage.faultBoundary === undefined
        ? {}
        : { faultBoundary: stage.faultBoundary as FaultBoundary }),
    };
  });
  if (
    stages.length !== QUALIFICATION_STAGES.length ||
    stages.some((stage, index) => stage.stage !== QUALIFICATION_STAGES[index])
  ) {
    throw new Error("MISSING_OR_MISORDERED_STAGE_ADAPTERS");
  }
  const outputs = stages.flatMap((stage) => stage.outputs);
  if (new Set(outputs).size !== outputs.length || outputs.some((file) => !file.startsWith("work/")))
    throw new Error("STAGE_OUTPUT_OWNERSHIP_CONFLICT");
  if (!Array.isArray(input.comparisonFiles) || !input.comparisonFiles.length)
    throw new Error("MISSING_SELECTED_PROJECTION");
  const comparisonFiles = input.comparisonFiles.map(relativeFile);
  if (
    new Set(comparisonFiles).size !== comparisonFiles.length ||
    comparisonFiles.some((file) => !outputs.includes(file))
  )
    throw new Error("UNDECLARED_SELECTED_PROJECTION");
  return {
    schema: "hdri-rehearsal-profile@1",
    runtimeRoot: input.runtimeRoot,
    fixtureRoot: input.fixtureRoot,
    // undefined values are not fingerprintable — omit the key entirely.
    ...(input.browserRoot === undefined ? {} : { browserRoot: input.browserRoot as string }),
    stageTimeoutMs: input.stageTimeoutMs,
    stages,
    comparisonFiles,
  };
}

async function containedFile(root: string, uri: string): Promise<string> {
  const candidate = path.join(root, relativeFile(uri));
  const real = await fs.realpath(candidate);
  if (
    real !== candidate ||
    !real.startsWith(`${root}${path.sep}`) ||
    !(await fs.lstat(real)).isFile()
  ) {
    throw new Error(`UNSAFE_REHEARSAL_FILE:${uri}`);
  }
  return real;
}
async function fileProof(root: string, uri: string): Promise<FileProof> {
  const proof = { uri, ...(await digestFile(await containedFile(root, uri))) };
  if (proof.bytes === 0) throw new Error(`EMPTY_STAGE_EVIDENCE:${uri}`);
  return proof;
}
async function assertProof(root: string, proof: FileProof): Promise<void> {
  if (digestValue(await fileProof(root, proof.uri)).sha256 !== digestValue(proof).sha256)
    throw new Error(`CHANGED_COMPLETED_EVIDENCE:${proof.uri}`);
}
async function writeJson(file: string, value: unknown, immutable = false): Promise<void> {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = immutable ? file : `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (!immutable) await fs.rename(temporary, file);
  const directory = await fs.open(path.dirname(file), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

/** Reject a symlinked parent before mkdir can create anything through it. */
async function assertCanonicalAncestors(candidate: string): Promise<void> {
  let existing = candidate;
  while (true) {
    try {
      await fs.lstat(existing);
      if ((await fs.realpath(existing)) !== existing) throw new Error("SYMLINK_REHEARSAL_ROOT");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (existing === path.dirname(existing)) throw error;
      existing = path.dirname(existing);
    }
  }
}

export interface RehearsalOptions {
  profile: string;
  targets: number;
  evidenceRoot: string;
  resume?: string;
  compare?: string;
  /** Controller-boundary fault for exercising resume; not a production CAS/transaction fault. */
  interruptAfterStage?: string;
  /** Stage whose declared faultBoundary is armed on its first produce attempt. */
  faultStage?: string;
}

export async function runRehearsal(options: RehearsalOptions): Promise<RunManifest> {
  if (![1000, 10_000, 50_000, 200_000].includes(options.targets))
    throw new Error("INVALID_TARGET_COUNT");
  const profile = parseProfile(JSON.parse(await fs.readFile(options.profile, "utf8")));
  for (const key of ["runtimeRoot", "fixtureRoot"] as const) {
    if ((await fs.realpath(profile[key])) !== profile[key])
      throw new Error("SYMLINK_REHEARSAL_ROOT");
  }
  if (profile.browserRoot && (await fs.realpath(profile.browserRoot)) !== profile.browserRoot)
    throw new Error("SYMLINK_REHEARSAL_ROOT");
  const root = path.resolve(options.evidenceRoot);
  if (["/", "/tmp", "/var", "/home", process.cwd(), process.env.HOME].includes(root))
    throw new Error("REHEARSAL_ROOT_TOO_BROAD");
  await assertCanonicalAncestors(root);
  for (const source of [profile.runtimeRoot, profile.fixtureRoot]) {
    if (root === source || root.startsWith(`${source}/`) || source.startsWith(`${root}/`))
      throw new Error("OVERLAPPING_REHEARSAL_ROOTS");
  }
  for (const stage of profile.stages) {
    await containedFile(profile.runtimeRoot, stage.producer);
    await containedFile(profile.runtimeRoot, stage.verifier);
  }
  if (
    options.interruptAfterStage &&
    !profile.stages.some((stage) => stage.stage === options.interruptAfterStage)
  )
    throw new Error("UNKNOWN_INTERRUPTION_STAGE");
  if (options.faultStage) {
    const faultStage = profile.stages.find((stage) => stage.stage === options.faultStage);
    if (!faultStage) throw new Error("UNKNOWN_FAULT_STAGE");
    if (!faultStage.faultBoundary)
      throw new Error(`STAGE_HAS_NO_FAULT_BOUNDARY:${options.faultStage}`);
  }
  const node = await fs.realpath(process.execPath);
  const browserSha256 = profile.browserRoot
    ? (await digestDirectory(profile.browserRoot)).sha256
    : null;
  const identity = {
    targets: options.targets,
    profileSha256: digestValue({
      ...profile,
      runtimeRoot: "/runtime/closure",
      fixtureRoot: "/input/fixtures",
      browserRoot: "/runtime/browsers",
    }).sha256,
    runtimeSha256: (await digestDirectory(profile.runtimeRoot)).sha256,
    fixtureSha256: (await digestDirectory(profile.fixtureRoot)).sha256,
    nodeSha256: (await digestFile(node)).sha256,
    browserSha256,
    browserSlots: REFERENCE_PROFILE_LIMITS.maxBrowserWorkers,
  };
  const inputFingerprint = digestValue(identity).sha256;
  const manifestPath = path.join(root, "run-manifest.json");
  if (options.compare && path.resolve(options.compare) === manifestPath)
    throw new Error("SELF_COMPARISON_FORBIDDEN");
  if (options.resume && path.resolve(options.resume) !== manifestPath)
    throw new Error("RESUME_MANIFEST_ROOT_MISMATCH");
  if (!options.resume) {
    try {
      if ((await fs.readdir(root)).length) throw new Error("FRESH_REHEARSAL_ROOT_NOT_EMPTY");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  } else {
    await containedFile(root, "run-manifest.json");
  }
  await fs.mkdir(root, { recursive: true });
  if ((await fs.realpath(root)) !== root) throw new Error("SYMLINK_REHEARSAL_ROOT");
  const lockPath = path.join(root, ".rehearsal-lock.sqlite");
  await assertCanonicalAncestors(lockPath);
  // SQLite owns the process lock: a killed coordinator releases it without stale PID reclamation.
  const lock = new Database(lockPath, { timeout: 0 });
  let manifest: RunManifest | undefined;
  try {
    lock.exec("BEGIN EXCLUSIVE");
    if (options.resume) {
      const loaded = record(JSON.parse(await fs.readFile(manifestPath, "utf8")), "RESUME_MANIFEST");
      if (
        loaded.schema !== "hdri-rehearsal-run@1" ||
        loaded.inputFingerprint !== inputFingerprint ||
        loaded.operationallyQualified !== false ||
        !Number.isSafeInteger(loaded.elapsedMs) ||
        (loaded.elapsedMs as number) < 0 ||
        !["running", "interrupted", "complete"].includes(loaded.status as string) ||
        Object.entries(identity).some(([field, value]) => loaded[field] !== value) ||
        !Array.isArray(loaded.stages) ||
        loaded.stages.length > profile.stages.length ||
        !Array.isArray(loaded.faults) ||
        !Number.isSafeInteger(loaded.peakWorkBytes) ||
        !Number.isSafeInteger(loaded.peakWorkFiles)
      )
        throw new Error("RESUME_INPUT_MISMATCH");
      const candidate = loaded as unknown as RunManifest;
      for (const [index, stage] of candidate.stages.entries()) {
        if (
          stage.stage !== profile.stages[index]!.stage ||
          stage.inputFingerprint !== inputFingerprint
        )
          throw new Error("RESUME_STAGE_MISMATCH");
        if (
          JSON.stringify(stage.outputs.map((proof) => proof.uri)) !==
          JSON.stringify(profile.stages[index]!.outputs)
        )
          throw new Error("RESUME_OUTPUT_MISMATCH");
        if (!Array.isArray(stage.samples) || stage.samples.length !== 2)
          throw new Error("RESUME_SAMPLES_MISSING");
        for (const proof of [
          ...stage.outputs,
          stage.execution,
          stage.verification,
          ...stage.samples,
        ])
          await assertProof(root, proof);
      }
      // Invalid resume inputs must not rewrite the original manifest while reporting failure.
      manifest = candidate;
    } else {
      await writeJson(
        manifestPath,
        {
          schema: "hdri-rehearsal-run@1",
          ...identity,
          inputFingerprint,
          stages: [],
          faults: [],
          peakWorkBytes: 0,
          peakWorkFiles: 0,
          status: "running",
          selectedProjectionSha256: null,
          comparison: null,
          operationallyQualified: false,
          elapsedMs: 0,
        },
        true,
      );
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as RunManifest;
    }
    const receipts = path.join(root, "receipts");
    await assertCanonicalAncestors(receipts);
    await fs.mkdir(receipts, { recursive: true });
    // Outputs are addressed as work/* in the manifest; the mount hides controller state and signing inputs.
    const workRoot = path.join(root, "work");
    await assertCanonicalAncestors(workRoot);
    await fs.mkdir(workRoot, { recursive: true });
    for (let index = manifest.stages.length; index < profile.stages.length; index++) {
      const stage = profile.stages[index]!;
      const attempt = `${String(index).padStart(2, "0")}-${randomUUID()}`;
      const samples: FileProof[] = [];
      // The stage's consumed-input fingerprint binds it to the fixture plus the
      // byte-exact outputs of every completed upstream stage.
      const consumedSha256 = digestValue({
        fixture: identity.fixtureSha256,
        upstream: manifest.stages.flatMap((completed) => completed.outputs),
      }).sha256;
      const faultAttempt =
        manifest.faults.filter((fault) => fault.stage === stage.stage).length + 1;
      const armFault =
        options.faultStage === stage.stage && faultAttempt === 1 ? stage.faultBoundary : undefined;
      // An incomplete stage re-runs from a clean directory: partial outputs of a
      // faulted attempt are never reused.
      const stageWorkDir = path.join(workRoot, stage.stage);
      await fs.rm(stageWorkDir, { recursive: true, force: true });
      const run = async (entry: string, mode: string) => {
        const remainingMs = REFERENCE_PROFILE_LIMITS.maxDurationMs - manifest!.elapsedMs;
        if (remainingMs <= 0) throw new Error("REHEARSAL_DURATION_EXCEEDED");
        const sampleUri = `receipts/${attempt}-${mode}-samples.jsonl`;
        const sampleHandle = await fs.open(path.join(root, sampleUri), "wx");
        const started = performance.now();
        try {
          return await runIsolatedProcess({
            executable: "/runtime/node",
            args: [
              `/runtime/closure/${entry}`,
              "--stage",
              stage.stage,
              "--targets",
              String(options.targets),
              "--mode",
              mode,
              "--fixture-root",
              "/input/fixtures",
              "--work-root",
              "/scratch",
              "--input-fingerprint",
              inputFingerprint,
              "--consumed",
              consumedSha256,
              "--fault-attempt",
              String(faultAttempt),
              "--browser-slots",
              String(identity.browserSlots),
              ...(armFault && mode === "produce" ? ["--fault-boundary", armFault] : []),
            ],
            readOnlyMounts: [
              { source: node, destination: "/runtime/node" },
              { source: profile.runtimeRoot, destination: "/runtime/closure" },
              { source: profile.fixtureRoot, destination: "/input/fixtures" },
              ...(profile.browserRoot
                ? [{ source: profile.browserRoot, destination: "/runtime/browsers" }]
                : []),
            ],
            scratchRoot: workRoot,
            timeoutMs: Math.min(profile.stageTimeoutMs, remainingMs),
            maxOutputBytes: 1_048_576,
            onSample: async (sample) => {
              await sampleHandle.appendFile(`${JSON.stringify(sample)}\n`);
              if (
                sample.coordinatorRssBytes > REFERENCE_PROFILE_LIMITS.coordinatorRssBytes ||
                sample.coordinatorRssBytes + sample.descendantRssBytes >
                  REFERENCE_PROFILE_LIMITS.processTreeRssBytes
              )
                throw new Error("REHEARSAL_RSS_EXCEEDED");
            },
          });
        } finally {
          manifest!.elapsedMs += Math.ceil(performance.now() - started);
          try {
            await sampleHandle.sync();
          } finally {
            await sampleHandle.close();
          }
          samples.push(await fileProof(root, sampleUri));
        }
      };
      const execution = await run(stage.producer, "produce");
      const executionUri = `receipts/${attempt}-execution.json`;
      await writeJson(path.join(root, executionUri), execution, true);
      if (execution.exitCode === FAULT_EXIT_CODE) {
        // Deterministic failpoint: preserve the acknowledgement the producer
        // sealed at the boundary, record it, then interrupt for resume.
        const ackName = `fault-${armFault}.json`;
        const ackSource = path.join(stageWorkDir, ackName);
        const ackUri = `receipts/${attempt}-${ackName}`;
        await fs.copyFile(ackSource, path.join(root, ackUri));
        manifest.faults.push({
          stage: stage.stage,
          boundary: armFault!,
          attempt: faultAttempt,
          receipt: await fileProof(root, ackUri),
        });
        manifest.status = "interrupted";
        await writeJson(manifestPath, manifest);
        throw new Error(`REHEARSAL_FAULT_INTERRUPTED:${stage.stage}:${armFault}`);
      }
      if (execution.exitCode !== 0)
        throw new Error(`STAGE_EXECUTION_FAILED:${stage.stage}:${execution.stderr}`);
      const outputs = await Promise.all(stage.outputs.map((uri) => fileProof(root, uri)));
      const verification = await run(stage.verifier, "verify");
      const verificationUri = `receipts/${attempt}-verification.json`;
      await writeJson(path.join(root, verificationUri), verification, true);
      if (verification.exitCode !== 0)
        throw new Error(`STAGE_VERIFICATION_FAILED:${stage.stage}:${verification.stderr}`);
      const verdict = record(JSON.parse(verification.stdout), "STAGE_VERIFICATION");
      if (
        verdict.schema !== "hdri-stage-verification@1" ||
        verdict.stage !== stage.stage ||
        verdict.inputFingerprint !== inputFingerprint ||
        verdict.status !== "pass" ||
        verdict.targets !== options.targets ||
        verdict.consumedSha256 !== consumedSha256 ||
        digestValue(verdict.outputs).sha256 !== digestValue(outputs).sha256
      ) {
        throw new Error(`STAGE_VERIFICATION_MISMATCH:${stage.stage}`);
      }
      for (const proof of outputs) await assertProof(root, proof);
      // A later stage may read, but may not rewrite, the already selected evidence.
      for (const completed of manifest.stages)
        for (const proof of completed.outputs) await assertProof(root, proof);
      manifest.stages.push({
        stage: stage.stage,
        inputFingerprint,
        consumedSha256,
        outputs,
        execution: await fileProof(root, executionUri),
        verification: await fileProof(root, verificationUri),
        samples,
      });
      // Disk/inode peaks over the whole work tree after each completed stage.
      let workBytes = 0;
      let workFiles = 0;
      const walk = async (dir: string): Promise<void> => {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else if (entry.isFile()) {
            workFiles += 1;
            workBytes += (await fs.lstat(full)).size;
          }
        }
      };
      await walk(workRoot);
      manifest.peakWorkBytes = Math.max(manifest.peakWorkBytes, workBytes);
      manifest.peakWorkFiles = Math.max(manifest.peakWorkFiles, workFiles);
      manifest.status = "running";
      await writeJson(manifestPath, manifest);
      if (options.interruptAfterStage === stage.stage)
        throw new Error(`REHEARSAL_INTERRUPTED:${stage.stage}`);
    }
    if (
      (await digestDirectory(profile.runtimeRoot)).sha256 !== identity.runtimeSha256 ||
      (await digestDirectory(profile.fixtureRoot)).sha256 !== identity.fixtureSha256
    )
      throw new Error("REHEARSAL_INPUTS_CHANGED");
    const projection = await Promise.all(
      profile.comparisonFiles.map((uri) => fileProof(root, uri)),
    );
    manifest.selectedProjectionSha256 = digestValue(projection).sha256;
    if (options.compare) {
      const comparePath = path.resolve(options.compare);
      if (comparePath === manifestPath) throw new Error("SELF_COMPARISON_FORBIDDEN");
      const clean = record(JSON.parse(await fs.readFile(comparePath, "utf8")), "CLEAN_RUN");
      if (
        clean.status !== "complete" ||
        clean.inputFingerprint !== inputFingerprint ||
        clean.selectedProjectionSha256 !== manifest.selectedProjectionSha256
      ) {
        throw new Error("RESUME_PROJECTION_MISMATCH");
      }
      for (const proof of projection) await assertProof(path.dirname(comparePath), proof);
      manifest.comparison = {
        inputFingerprint,
        selectedProjectionSha256: manifest.selectedProjectionSha256,
        match: true,
      };
    }
    manifest.status = "complete";
    // Qualification is only claimed when the resumed run's selected projection
    // is byte-identical to a completed clean run's — the recovery proof.
    manifest.operationallyQualified = manifest.comparison?.match === true;
    await writeJson(manifestPath, manifest);
    return manifest;
  } catch (error) {
    if (manifest) {
      manifest.status = "interrupted";
      await writeJson(manifestPath, manifest);
    }
    throw error;
  } finally {
    if (lock.inTransaction) lock.exec("ROLLBACK");
    lock.close();
  }
}
