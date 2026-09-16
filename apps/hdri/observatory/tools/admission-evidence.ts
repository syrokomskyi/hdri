/*
<MODULE_CONTRACT>
<purpose>Operator-facing admission evidence tooling: mint signed hdri-admission-evidence@1 envelopes over real domain artifacts, build pinned trust manifests, measure capacity reports and author hdri-admission-input@1 files.</purpose>
<non-goals>
  <item>Does not decide operational readiness — it binds existing artifacts into signed envelopes; the Program Gate and domain verifier still check the claims.</item>
  <item>Does not store private keys outside an explicit fresh operator-chosen directory.</item>
  <item>Does not weaken the fail-closed gate: fixture-class envelopes never satisfy operational admission.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A2: initial admission evidence CLI — keygen, trust, mint, capacity, input subcommands.</item>
</CHANGE_SUMMARY>
*/

import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  ADMISSION_ARTIFACT_SCHEMAS,
  type EvidenceRef,
  type EvidenceScope,
} from "@syrokomskyi/factory-core";
import {
  generateSigningKey,
  signAdmissionEvidence,
  type SigningKeyConfig,
} from "@syrokomskyi/observatory-crypto";

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_KEY_BYTES = 64 * 1024;
const ROLES = new Set(Object.keys(ADMISSION_ARTIFACT_SCHEMAS));
const PERIOD = /^\d{4}-q[1-4]$/;
const SHA256 = /^[0-9a-f]{64}$/;

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function fail(message: string): never {
  throw new Error(message);
}

async function readBoundedLocal(filePath: string, maxBytes: number): Promise<Buffer> {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`NOT_A_REGULAR_FILE: ${filePath}`);
  if (stat.size > maxBytes) fail(`FILE_TOO_LARGE: ${filePath}`);
  const bytes = await fs.readFile(filePath);
  if (bytes.length !== stat.size) fail(`FILE_CHANGED_WHILE_READING: ${filePath}`);
  return bytes;
}

function requireValue(values: Record<string, string | boolean | undefined>, name: string): string {
  const value = values[name];
  if (typeof value !== "string" || !value) fail(`MISSING_${name.replaceAll("-", "_").toUpperCase()}`);
  return value;
}

function requirePeriod(values: Record<string, string | boolean | undefined>): string {
  const period = requireValue(values, "period");
  if (!PERIOD.test(period)) fail("INVALID_PERIOD");
  return period;
}

function requireScope(
  values: Record<string, string | boolean | undefined>,
): EvidenceScope {
  const operation = requireValue(values, "operation");
  if (!["preserve", "collect", "publish"].includes(operation)) fail("INVALID_OPERATION");
  const evidenceClass = requireValue(values, "evidence-class");
  if (!["fixture", "operational"].includes(evidenceClass)) fail("INVALID_EVIDENCE_CLASS");
  const policySha256 = requireValue(values, "policy-sha256");
  if (!SHA256.test(policySha256)) fail("INVALID_POLICY_SHA256");
  return {
    period: requirePeriod(values),
    capsuleId: requireValue(values, "capsule-id"),
    operation: operation as EvidenceScope["operation"],
    implementationFingerprint: requireValue(values, "implementation-fingerprint"),
    policySha256,
    evidenceClass: evidenceClass as EvidenceScope["evidenceClass"],
  };
}

async function loadSigningKey(
  values: Record<string, string | boolean | undefined>,
): Promise<SigningKeyConfig> {
  const privateKeyPem = (
    await readBoundedLocal(path.resolve(requireValue(values, "private-key")), MAX_KEY_BYTES)
  ).toString("utf8");
  const publicKeyPem = createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: "spki", format: "pem" })
    .toString();
  const collectorId =
    (typeof values["collector-id"] === "string" && values["collector-id"]) ||
    process.env.DEVICE_ID ||
    fail("MISSING_COLLECTOR_ID");
  return {
    privateKeyPem,
    publicKeyPem,
    signingKeyId: requireValue(values, "key-id"),
    collectorId,
  };
}

async function writeExclusive(filePath: string, bytes: Buffer, mode: number): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fs.open(filePath, "wx", mode);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

// ---------------------------------------------------------------------------
// keygen — fresh Ed25519 pair in a fresh operator-chosen directory
// ---------------------------------------------------------------------------

async function keygen(values: Record<string, string | boolean | undefined>): Promise<void> {
  const outDir = path.resolve(requireValue(values, "out"));
  const stat = await fs.stat(outDir).catch(() => null);
  if (stat && (await fs.readdir(outDir)).length > 0) fail("KEYGEN_DIR_NOT_EMPTY");
  await fs.mkdir(outDir, { mode: 0o700 });
  const { privateKeyPem, publicKeyPem } = generateSigningKey();
  await writeExclusive(path.join(outDir, "private.pem"), Buffer.from(privateKeyPem), 0o600);
  await writeExclusive(path.join(outDir, "public.pem"), Buffer.from(publicKeyPem), 0o644);
  process.stdout.write(
    `${JSON.stringify({ schema: "hdri-admission-keygen@1", publicKey: path.join(outDir, "public.pem") })}\n`,
  );
}

// ---------------------------------------------------------------------------
// trust — build hdri-admission-trust@1 and print its pin digest
// ---------------------------------------------------------------------------

async function trust(values: Record<string, string | boolean | undefined>): Promise<void> {
  const out = path.resolve(requireValue(values, "out"));
  const keyClass = requireValue(values, "key-class");
  if (keyClass !== "fixture" && keyClass !== "operational") fail("INVALID_KEY_CLASS");
  const entries = (Array.isArray(values.key) ? values.key : [values.key]).filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  if (!entries.length) fail("MISSING_KEY");
  const keys = [];
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0) fail("INVALID_KEY_SPEC");
    const signingKeyId = entry.slice(0, separator);
    const publicKeyPem = (
      await readBoundedLocal(path.resolve(entry.slice(separator + 1)), MAX_KEY_BYTES)
    ).toString("utf8");
    keys.push({ signingKeyId, publicKeyPem, keyClass });
  }
  const manifest = Buffer.from(
    `${JSON.stringify({ schema: "hdri-admission-trust@1", keys }, null, 2)}\n`,
  );
  await writeExclusive(out, manifest, 0o644);
  process.stdout.write(
    `${JSON.stringify({ schema: "hdri-admission-trust-written@1", path: out, sha256: sha256(manifest) })}\n`,
  );
}

// ---------------------------------------------------------------------------
// mint — sign one evidence envelope over an artifact inside the evidence root
// ---------------------------------------------------------------------------

async function mint(values: Record<string, string | boolean | undefined>): Promise<void> {
  const evidenceRoot = path.resolve(requireValue(values, "evidence-root"));
  const role = requireValue(values, "role");
  if (!ROLES.has(role)) fail("INVALID_ROLE");
  const artifactUri = requireValue(values, "artifact");
  if (
    artifactUri.includes("\\") ||
    path.posix.isAbsolute(artifactUri) ||
    artifactUri.split("/").some((part) => !part || part === "." || part === "..")
  ) fail("INVALID_ARTIFACT_URI");
  const artifactSchema = requireValue(values, "artifact-schema");
  const expectedSchema = ADMISSION_ARTIFACT_SCHEMAS[role as keyof typeof ADMISSION_ARTIFACT_SCHEMAS];
  if (artifactSchema !== expectedSchema)
    fail(`ARTIFACT_SCHEMA_MISMATCH: role ${role} requires ${expectedSchema}`);
  const artifactBytes = await readBoundedLocal(
    path.join(evidenceRoot, artifactUri),
    MAX_ARTIFACT_BYTES,
  );
  const scope = requireScope(values);
  const signingKey = await loadSigningKey(values);
  const manifest = signAdmissionEvidence({
    signingKey,
    role,
    scope,
    evidence: {
      schema: artifactSchema,
      uri: artifactUri,
      bytes: artifactBytes.length,
      sha256: sha256(artifactBytes),
    },
  });
  const envelopeUri =
    typeof values.out === "string" && values.out ? values.out : `${role}.json`;
  if (
    envelopeUri.includes("\\") ||
    path.posix.isAbsolute(envelopeUri) ||
    envelopeUri.split("/").some((part) => !part || part === "." || part === "..")
  ) fail("INVALID_ENVELOPE_URI");
  const envelopeBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeExclusive(path.join(evidenceRoot, envelopeUri), envelopeBytes, 0o644);
  const ref: EvidenceRef = {
    schema: "hdri-admission-evidence@1",
    uri: envelopeUri,
    bytes: envelopeBytes.length,
    sha256: sha256(envelopeBytes),
  };
  process.stdout.write(`${JSON.stringify({ schema: "hdri-admission-ref@1", role, ref })}\n`);
}

// ---------------------------------------------------------------------------
// capacity — measure this machine and write hdri-capacity-report@1
// ---------------------------------------------------------------------------

async function capacity(values: Record<string, string | boolean | undefined>): Promise<void> {
  const out = path.resolve(requireValue(values, "out"));
  const period = requirePeriod(values);
  const runner =
    (typeof values.runner === "string" && values.runner) ||
    process.env.DEVICE_ID ||
    fail("MISSING_RUNNER");
  const measurePath = path.resolve(
    typeof values.path === "string" && values.path ? values.path : process.cwd(),
  );
  const minDisk = Number(requireValue(values, "min-free-disk-bytes"));
  const minMemory = Number(requireValue(values, "min-available-memory-bytes"));
  const minInodes = Number(requireValue(values, "min-free-inodes"));
  if (!Number.isSafeInteger(minDisk) || !Number.isSafeInteger(minMemory) || !Number.isSafeInteger(minInodes))
    fail("INVALID_CAPACITY_THRESHOLD");
  const stats = await fs.statfs(measurePath);
  const freeDiskBytes = Number(stats.bavail) * Number(stats.bsize);
  const freeInodes = Number(stats.ffree);
  const availableMemoryBytes = os.freemem();
  const verdict =
    freeDiskBytes >= minDisk && availableMemoryBytes >= minMemory && freeInodes >= minInodes
      ? "pass"
      : "fail";
  const report = {
    schema: "hdri-capacity-report@1",
    period,
    runner,
    measuredAt: new Date().toISOString(),
    measuredPath: measurePath,
    minimums: {
      freeDiskBytes: minDisk,
      availableMemoryBytes: minMemory,
      freeInodes: minInodes,
    },
    resources: { freeDiskBytes, availableMemoryBytes, freeInodes },
    verdict,
  };
  await writeExclusive(out, Buffer.from(`${JSON.stringify(report, null, 2)}\n`), 0o644);
  process.stdout.write(
    `${JSON.stringify({ schema: "hdri-capacity-written@1", path: out, verdict })}\n`,
  );
}

// ---------------------------------------------------------------------------
// input — author hdri-admission-input@1 from envelope files in the evidence root
// ---------------------------------------------------------------------------

async function input(values: Record<string, string | boolean | undefined>): Promise<void> {
  const evidenceRoot = path.resolve(requireValue(values, "evidence-root"));
  const out = path.resolve(requireValue(values, "out"));
  const scope = requireScope(values);
  const refs: Record<string, EvidenceRef | null> = {};
  for (const role of ROLES) {
    const uri = values[role];
    if (typeof uri !== "string" || !uri) {
      refs[role] = null;
      continue;
    }
    if (
      uri.includes("\\") ||
      path.posix.isAbsolute(uri) ||
      uri.split("/").some((part) => !part || part === "." || part === "..")
    ) fail(`INVALID_${role.toUpperCase()}_URI`);
    const bytes = await readBoundedLocal(path.join(evidenceRoot, uri), MAX_ARTIFACT_BYTES);
    refs[role] = {
      schema: "hdri-admission-evidence@1",
      uri,
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  }
  const inputDoc = {
    schema: "hdri-admission-input@1",
    scope,
    preservation: refs.preservation ?? null,
    qualification: refs.qualification ?? null,
    predecessor: refs.predecessor ?? null,
    capacity: refs.capacity ?? null,
    publication: refs.publication ?? null,
  };
  await writeExclusive(out, Buffer.from(`${JSON.stringify(inputDoc, null, 2)}\n`), 0o644);
  process.stdout.write(
    `${JSON.stringify({ schema: "hdri-admission-input-written@1", path: out })}\n`,
  );
}

// ---------------------------------------------------------------------------

const COMMANDS: Record<
  string,
  (values: Record<string, string | boolean | undefined>) => Promise<void>
> = { keygen, trust, mint, capacity, input };

export async function main(args = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = args;
  const handler = command ? COMMANDS[command] : undefined;
  if (!handler)
    fail(
      "USAGE: admission-evidence <keygen|trust|mint|capacity|input> [options]",
    );
  const { values } = parseArgs({
    args: rest,
    strict: true,
    allowPositionals: false,
    options: {
      out: { type: "string" },
      key: { type: "string", multiple: true },
      "key-class": { type: "string" },
      "key-id": { type: "string" },
      "private-key": { type: "string" },
      "collector-id": { type: "string" },
      "evidence-root": { type: "string" },
      role: { type: "string" },
      artifact: { type: "string" },
      "artifact-schema": { type: "string" },
      period: { type: "string" },
      "capsule-id": { type: "string" },
      operation: { type: "string" },
      "implementation-fingerprint": { type: "string" },
      "policy-sha256": { type: "string" },
      "evidence-class": { type: "string" },
      runner: { type: "string" },
      path: { type: "string" },
      "min-free-disk-bytes": { type: "string" },
      "min-available-memory-bytes": { type: "string" },
      "min-free-inodes": { type: "string" },
      preservation: { type: "string" },
      qualification: { type: "string" },
      predecessor: { type: "string" },
      capacity: { type: "string" },
      publication: { type: "string" },
    },
  });
  await handler(values as Record<string, string | boolean | undefined>);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ status: "error", error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exitCode = 1;
  });
}
