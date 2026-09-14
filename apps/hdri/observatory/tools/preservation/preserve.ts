/*
<MODULE_CONTRACT>
  <purpose>Retain Q2 bytes and SQLite snapshots in complete signed, verified copies.</purpose>
  <non-goals><item>Does not mutate original evidence, convert historical identities or certify physical custody from destination labels.</item></non-goals>
  <!-- risk: crypto, sign, fs-write -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Replace flat replica receipts and source-side snapshots with fresh signed closures and pinned full read-back.</item><item>Recover private journal copies and finalize standalone SQLite snapshots before retaining their exact bytes.</item><item>Prepare isolated baseline input from externally pinned complete replicas, with exact copy read-back and snapshot coverage checks.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Original databases are never opened by SQLite; snapshots use private copies of retained DB/WAL bytes.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  canonicalize,
  type SigningKeyConfig,
  type VerificationKey,
} from "@syrokomskyi/observatory-crypto";
import {
  assertCanonicalFilePath,
  assertDisjointPaths,
  assertFreshDirectory,
  assertRelativeObjectPath,
  copyVerifiedFile,
  inspectRetainedFile,
  readBoundedFile,
  syncDirectory,
  writeExclusiveFile,
} from "@warpgogol/pipeline-node";
import type { PreservationDiagnostic } from "./contracts.js";
import {
  acquirePreservationLock,
  inventorySources,
  verifyInventoryIntegrity,
  type InventoryEntry,
} from "./inventory.js";

export interface DestinationInfo {
  path: string;
  failureDomain: string;
  medium: string;
  credentialBoundary: string;
}
interface PreservedObject {
  uri: string;
  sourceRole: string;
  representation: "original" | "sqlite-snapshot";
  sha256: string;
  bytes: number;
  access: "internal" | "restricted" | "public";
}
export interface ContentManifest {
  schema: "hdri-content-manifest@2";
  period: "2026-q2";
  signingKeyId: string;
  sourceInventory: InventoryEntry[];
  artifacts: PreservedObject[];
}
export interface DestinationReceipt {
  schema: "hdri-destination-receipt@2";
  period: "2026-q2";
  destination: DestinationInfo;
  totalObjects: number;
  totalBytes: number;
  contentManifestSha256: string;
  signatureSha256: string;
  verificationKeySha256: string;
}
const SHA = /^[0-9a-f]{64}$/;
const JSON_LIMIT = 64 * 1024 * 1024;
const MIN_DESTINATIONS = 3;
const MAX_OBJECTS = 1_000_000;
const META_FILES = [
  "content-manifest.json",
  "content-manifest.sig",
  "verification-key.pem",
  "destination-receipt.json",
];
const digest = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown): Buffer => Buffer.from(canonicalize(value), "utf8");
function fields(value: unknown, names: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_PRESERVATION_OBJECT");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== names.length || names.some((name) => !(name in object)))
    throw new Error("INVALID_PRESERVATION_FIELDS");
  return object;
}
export function parseDestinations(raw: unknown): DestinationInfo[] {
  if (!Array.isArray(raw) || raw.length < MIN_DESTINATIONS || raw.length > 32)
    throw new Error("UNVERIFIED_REPLICA: at least three destinations required");
  const destinations = raw.map((value) => {
    const d = fields(value, ["path", "failureDomain", "medium", "credentialBoundary"]);
    if (Object.values(d).some((v) => typeof v !== "string" || !v.trim()))
      throw new Error("INVALID_DESTINATION");
    if (!path.isAbsolute(d.path as string) || path.normalize(d.path as string) !== d.path)
      throw new Error("INVALID_DESTINATION_PATH");
    return d as unknown as DestinationInfo;
  });
  checkDestinationIndependence(destinations);
  assertDisjointPaths(destinations.map((d) => d.path));
  return destinations;
}
/** Declared metadata only: physical independence requires separately authenticated custody evidence. */
export function checkDestinationIndependence(destinations: readonly DestinationInfo[]): void {
  for (const field of ["failureDomain", "medium", "credentialBoundary"] as const) {
    if (
      destinations.some((d) => typeof d[field] !== "string" || !d[field].trim()) ||
      new Set(destinations.map((d) => d[field].trim())).size !== destinations.length
    )
      throw new Error(
        `UNVERIFIED_REPLICA: repeated or missing ${field === "failureDomain" ? "failure domain" : field}`,
      );
  }
}
export function parsePreservationInventory(raw: unknown): InventoryEntry[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_OBJECTS)
    throw new Error("NONEMPTY_INVENTORY_REQUIRED");
  const inventory = raw.map((value) => {
    const entry = fields(value, ["absolutePath", "role", "access", "sha256", "bytes"]);
    if (
      typeof entry.absolutePath !== "string" ||
      !path.isAbsolute(entry.absolutePath) ||
      path.normalize(entry.absolutePath) !== entry.absolutePath ||
      typeof entry.role !== "string"
    )
      throw new Error("INVALID_SOURCE_IDENTITY");
    assertRelativeObjectPath(entry.role);
    if (
      typeof entry.sha256 !== "string" ||
      !SHA.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      (entry.bytes as number) < 0 ||
      typeof entry.access !== "string" ||
      !["internal", "restricted", "public"].includes(entry.access)
    )
      throw new Error("INVALID_SOURCE_DIGEST");
    return entry as unknown as InventoryEntry;
  });
  if (
    new Set(inventory.map((e) => e.role)).size !== inventory.length ||
    new Set(inventory.map((e) => e.absolutePath)).size !== inventory.length
  )
    throw new Error("DUPLICATE_SOURCE_IDENTITY");
  const roles = new Set(inventory.map((e) => e.role));
  for (const entry of inventory) {
    const segments = entry.role.split("/");
    for (let i = 1; i < segments.length; i++)
      if (roles.has(segments.slice(0, i).join("/"))) throw new Error("OVERLAPPING_SOURCE_ROLES");
  }
  return inventory.sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
}
function parseManifest(raw: unknown): ContentManifest {
  const m = fields(raw, ["schema", "period", "signingKeyId", "sourceInventory", "artifacts"]);
  if (
    m.schema !== "hdri-content-manifest@2" ||
    m.period !== "2026-q2" ||
    typeof m.signingKeyId !== "string" ||
    !m.signingKeyId
  )
    throw new Error("INVALID_CONTENT_MANIFEST");
  const sourceInventory = parsePreservationInventory(m.sourceInventory);
  const sources = new Map(sourceInventory.map((e) => [e.role, e]));
  if (
    !Array.isArray(m.artifacts) ||
    m.artifacts.length < sources.size ||
    m.artifacts.length > MAX_OBJECTS * 2
  )
    throw new Error("INCOMPLETE_MANIFEST");
  const artifacts = m.artifacts.map((raw) => {
    const a = fields(raw, ["uri", "sourceRole", "representation", "sha256", "bytes", "access"]);
    if (typeof a.uri !== "string" || typeof a.sourceRole !== "string")
      throw new Error("INVALID_ARTIFACT_REF");
    assertRelativeObjectPath(a.uri);
    const source = sources.get(a.sourceRole);
    if (
      !source ||
      typeof a.sha256 !== "string" ||
      !SHA.test(a.sha256) ||
      !Number.isSafeInteger(a.bytes) ||
      (a.bytes as number) < 0 ||
      a.access !== source.access
    )
      throw new Error("INVALID_ARTIFACT_REF");
    if (a.representation === "original") {
      if (
        a.uri !== `originals/${source.role}` ||
        a.sha256 !== source.sha256 ||
        a.bytes !== source.bytes
      )
        throw new Error("ORIGINAL_IDENTITY_MISMATCH");
    } else if (
      a.representation !== "sqlite-snapshot" ||
      a.uri !== `snapshots/${source.role}` ||
      !a.bytes
    )
      throw new Error("INVALID_SNAPSHOT_REF");
    return a as unknown as PreservedObject;
  });
  if (
    new Set(artifacts.map((a) => a.uri)).size !== artifacts.length ||
    artifacts.filter((a) => a.representation === "original").length !== sources.size
  )
    throw new Error("INCOMPLETE_MANIFEST");
  return {
    schema: m.schema,
    period: m.period,
    signingKeyId: m.signingKeyId,
    sourceInventory,
    artifacts,
  };
}
async function verifySources(inventory: InventoryEntry[], roots: string[]): Promise<void> {
  const current = await inventorySources({ roots });
  try {
    verifyInventoryIntegrity(inventory, current);
    const sizes = new Map(current.map((e) => [e.absolutePath, e.bytes]));
    if (inventory.some((e) => sizes.get(e.absolutePath) !== e.bytes))
      throw new Error("size mismatch");
  } catch (error) {
    throw new Error("CHANGED_SOURCE_BYTES", { cause: error });
  }
}
async function sqliteHeader(file: string): Promise<boolean> {
  let header: Buffer | undefined;
  await inspectRetainedFile(file, (chunk) => {
    header ??= Buffer.from(chunk.subarray(0, 16));
  });
  return header?.equals(Buffer.from("SQLite format 3\0")) ?? false;
}
async function createSnapshots(
  primary: string,
  inventory: InventoryEntry[],
): Promise<PreservedObject[]> {
  const snapshots: PreservedObject[] = [];
  const byPath = new Map(inventory.map((e) => [e.absolutePath, e]));
  for (const entry of inventory) {
    if (!(await sqliteHeader(path.join(primary, "originals", entry.role)))) continue;
    // SQLite may update SHM on a readonly connection: never open retained originals.
    const scratch = await fs.mkdtemp(path.join(path.dirname(primary), ".hdri-sqlite-snapshot-"));
    try {
      const dbFile = path.join(scratch, "source.db");
      await copyVerifiedFile(path.join(primary, "originals", entry.role), dbFile, entry);
      for (const suffix of ["-wal", "-journal"]) {
        const sidecar = byPath.get(`${entry.absolutePath}${suffix}`);
        if (sidecar)
          await copyVerifiedFile(
            path.join(primary, "originals", sidecar.role),
            `${dbFile}${suffix}`,
            sidecar,
          );
      }
      // Recovery/checkpointing is permitted only in this private scratch directory.
      const db = new Database(dbFile, { fileMustExist: true });
      const output = path.join(scratch, "snapshot.db");
      try {
        if (db.pragma("quick_check", { simple: true }) !== "ok")
          throw new Error("INVALID_SOURCE_SQLITE");
        await db.backup(output);
      } finally {
        db.close();
      }
      const standalone = new Database(output, { fileMustExist: true });
      try {
        if (
          standalone.pragma("journal_mode=DELETE", { simple: true }) !== "delete" ||
          standalone.pragma("quick_check", { simple: true }) !== "ok"
        )
          throw new Error("INVALID_SNAPSHOT_SQLITE");
      } finally {
        standalone.close();
      }
      const snapshot = {
        uri: `snapshots/${entry.role}`,
        sourceRole: entry.role,
        representation: "sqlite-snapshot" as const,
        access: entry.access,
        ...(await inspectRetainedFile(output)),
      };
      await copyVerifiedFile(output, path.join(primary, snapshot.uri), snapshot);
      snapshots.push(snapshot);
    } finally {
      await fs.rm(scratch, { recursive: true, force: true });
    }
  }
  return snapshots;
}
export interface PreserveQ2Options {
  inventory: InventoryEntry[];
  sourceRoots: string[];
  destinations: DestinationInfo[];
  dryRun: boolean;
  signingKey?: SigningKeyConfig;
}
export async function preserveQ2(opts: PreserveQ2Options): Promise<PreservationDiagnostic> {
  // Detach caller-owned metadata before yielding.
  const inventory = parsePreservationInventory(structuredClone(opts.inventory));
  const destinations = parseDestinations(structuredClone(opts.destinations));
  const roots = [...opts.sourceRoots];
  const key = opts.signingKey && { ...opts.signingKey };
  const dryRun = opts.dryRun;
  for (const root of roots) await assertCanonicalFilePath(root);
  assertDisjointPaths([...roots, ...destinations.map((d) => d.path)]);
  for (const dest of destinations) await assertFreshDirectory(dest.path);
  await verifySources(inventory, roots);
  if (dryRun)
    return {
      schema: "hdri-preservation@1",
      operation: "preserve:q2",
      status: "planned",
      inputFingerprint: digest(encode(inventory)),
      evidenceRefs: [],
      violations: [],
    };
  if (!key) throw new Error("PRESERVATION_SIGNING_KEY_REQUIRED");
  const privateKey = createPrivateKey(key.privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("ED25519_KEY_REQUIRED");
  const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  if (publicKey !== key.publicKeyPem || !key.signingKeyId) throw new Error("SIGNING_KEY_MISMATCH");
  const primary = destinations[0].path;
  await fs.mkdir(primary, { mode: 0o700 });
  await syncDirectory(path.dirname(primary));
  const lock = await acquirePreservationLock(primary);
  let manifestSha256 = "";
  try {
    const artifacts: PreservedObject[] = [];
    for (const entry of inventory) {
      const artifact: PreservedObject = {
        uri: `originals/${entry.role}`,
        sourceRole: entry.role,
        representation: "original",
        access: entry.access,
        sha256: entry.sha256,
        bytes: entry.bytes,
      };
      await copyVerifiedFile(entry.absolutePath, path.join(primary, artifact.uri), entry);
      artifacts.push(artifact);
    }
    artifacts.push(...(await createSnapshots(primary, inventory)));
    await verifySources(inventory, roots);
    const manifest = parseManifest({
      schema: "hdri-content-manifest@2",
      period: "2026-q2",
      signingKeyId: key.signingKeyId,
      sourceInventory: inventory,
      artifacts,
    });
    const manifestBytes = encode(manifest);
    if (manifestBytes.length > JSON_LIMIT) throw new Error("MANIFEST_BYTE_LIMIT_EXCEEDED");
    manifestSha256 = digest(manifestBytes);
    const payloadSha256 = digest(encode(manifest));
    const signatureBytes = encode({
      schema: "hdri-content-signature@1",
      signingKeyId: key.signingKeyId,
      payloadSha256,
      signature: sign(null, Buffer.from(payloadSha256, "hex"), privateKey).toString("base64url"),
    });
    const publicKeyBytes = Buffer.from(publicKey);
    for (const dest of destinations) {
      if (dest.path !== primary) {
        await assertFreshDirectory(dest.path);
        await fs.mkdir(dest.path, { mode: 0o700 });
        await syncDirectory(path.dirname(dest.path));
        for (const artifact of artifacts)
          await copyVerifiedFile(
            path.join(primary, artifact.uri),
            path.join(dest.path, artifact.uri),
            artifact,
          );
      }
      await writeExclusiveFile(path.join(dest.path, "content-manifest.json"), manifestBytes);
      await writeExclusiveFile(path.join(dest.path, "content-manifest.sig"), signatureBytes);
      await writeExclusiveFile(path.join(dest.path, "verification-key.pem"), publicKeyBytes);
      const receipt: DestinationReceipt = {
        schema: "hdri-destination-receipt@2",
        period: "2026-q2",
        destination: dest,
        totalObjects: artifacts.length,
        totalBytes: artifacts.reduce((sum, a) => sum + a.bytes, 0),
        contentManifestSha256: manifestSha256,
        signatureSha256: digest(signatureBytes),
        verificationKeySha256: digest(publicKeyBytes),
      };
      await writeExclusiveFile(path.join(dest.path, "destination-receipt.json"), encode(receipt));
    }
    await verifySources(inventory, roots);
  } finally {
    await lock.release();
    await syncDirectory(primary);
  }
  const checked = await verifyReplicas({
    destinations,
    manifestSha256,
    verificationKeys: new Map([
      [key.signingKeyId, { signingKeyId: key.signingKeyId, publicKeyPem: publicKey }],
    ]),
  });
  if (checked.status !== "pass")
    throw new Error("PRESERVATION_READBACK_FAILED", { cause: checked.violations });
  return { ...checked, operation: "preserve:q2" };
}
export interface VerifyReplicasOptions {
  destinations: DestinationInfo[];
  manifestSha256: string;
  verificationKeys: ReadonlyMap<string, VerificationKey>;
}
async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (relative: string): Promise<void> => {
    for (const name of await fs.readdir(path.join(root, relative))) {
      const uri = relative ? `${relative}/${name}` : name;
      assertRelativeObjectPath(uri);
      const full = path.join(root, uri);
      await assertCanonicalFilePath(full);
      const stat = await fs.lstat(full);
      if (stat.isDirectory()) await visit(uri);
      else if (stat.isFile()) files.push(uri);
      else throw new Error("UNSAFE_REPLICA_OBJECT");
      if (files.length > MAX_OBJECTS * 2 + META_FILES.length)
        throw new Error("REPLICA_OBJECT_LIMIT_EXCEEDED");
    }
  };
  await assertCanonicalFilePath(root);
  await visit("");
  return files.sort();
}
async function verifyDestination(
  dest: DestinationInfo,
  expectedSha: string,
  keys: ReadonlyMap<string, VerificationKey>,
): Promise<ContentManifest> {
  await assertCanonicalFilePath(dest.path);
  const manifestBytes = await readBoundedFile(
    path.join(dest.path, "content-manifest.json"),
    JSON_LIMIT,
  );
  if (digest(manifestBytes) !== expectedSha) throw new Error("MANIFEST_DIGEST_MISMATCH");
  const manifest = parseManifest(JSON.parse(manifestBytes.toString("utf8")));
  const signatureBytes = await readBoundedFile(path.join(dest.path, "content-manifest.sig"), 4096);
  const signed = fields(JSON.parse(signatureBytes.toString("utf8")), [
    "schema",
    "signingKeyId",
    "payloadSha256",
    "signature",
  ]);
  const trusted = keys.get(manifest.signingKeyId);
  if (
    !trusted ||
    trusted.signingKeyId !== manifest.signingKeyId ||
    signed.schema !== "hdri-content-signature@1" ||
    signed.signingKeyId !== manifest.signingKeyId ||
    signed.payloadSha256 !== digest(encode(manifest)) ||
    typeof signed.signature !== "string" ||
    !/^[A-Za-z0-9_-]{86}$/.test(signed.signature)
  )
    throw new Error("INVALID_SIGNATURE");
  const publicKey = createPublicKey(trusted.publicKeyPem);
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    !verify(
      null,
      Buffer.from(signed.payloadSha256 as string, "hex"),
      publicKey,
      Buffer.from(signed.signature, "base64url"),
    )
  )
    throw new Error("INVALID_SIGNATURE");
  const keyBytes = await readBoundedFile(path.join(dest.path, "verification-key.pem"), 4096);
  if (keyBytes.toString("utf8") !== publicKey.export({ type: "spki", format: "pem" }).toString())
    throw new Error("VERIFICATION_KEY_MISMATCH");
  const expectedFiles = [...META_FILES, ...manifest.artifacts.map((a) => a.uri)].sort();
  if (JSON.stringify(await listFiles(dest.path)) !== JSON.stringify(expectedFiles))
    throw new Error("REPLICA_CLOSURE_MISMATCH");
  for (const artifact of manifest.artifacts) {
    const actual = await inspectRetainedFile(path.join(dest.path, artifact.uri));
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256)
      throw new Error("REPLICA_OBJECT_MISMATCH");
  }
  const receipt = fields(
    JSON.parse(
      (await readBoundedFile(path.join(dest.path, "destination-receipt.json"), 64 * 1024)).toString(
        "utf8",
      ),
    ),
    [
      "schema",
      "period",
      "destination",
      "totalObjects",
      "totalBytes",
      "contentManifestSha256",
      "signatureSha256",
      "verificationKeySha256",
    ],
  );
  fields(receipt.destination, ["path", "failureDomain", "medium", "credentialBoundary"]);
  if (
    receipt.schema !== "hdri-destination-receipt@2" ||
    receipt.period !== "2026-q2" ||
    canonicalize(receipt.destination) !== canonicalize(dest) ||
    receipt.totalObjects !== manifest.artifacts.length ||
    receipt.totalBytes !== manifest.artifacts.reduce((n, a) => n + a.bytes, 0) ||
    receipt.contentManifestSha256 !== expectedSha ||
    receipt.signatureSha256 !== digest(signatureBytes) ||
    receipt.verificationKeySha256 !== digest(keyBytes)
  )
    throw new Error("DESTINATION_RECEIPT_MISMATCH");
  return manifest;
}

export interface PrepareBaselineSourceOptions extends VerifyReplicasOptions {
  /** Must exactly select one of destinations; no implicit fallback to another copy. */
  sourceDestinationPath: string;
  /** New private directory, disjoint from every replica and original inventory root. */
  workRoot: string;
}
export interface PreparedBaselineSource {
  readonly root: string;
  readonly manifestSha256: string;
  readonly manifest: Readonly<Omit<ContentManifest, "sourceInventory" | "artifacts">> & {
    readonly sourceInventory: readonly Readonly<InventoryEntry>[];
    readonly artifacts: readonly Readonly<PreservedObject>[];
  };
}

/**
 * Copy the entire authenticated artifact closure into fresh private working storage.
 * This is input preparation, NOT conversion, an import receipt or admission authority.
 * No SQLite connection touches originals or replicas. Consumers must open only copied
 * sqlite-snapshot representations, validate supported schemas and keep the work root
 * writer-exclusive until all source streams are consumed and checked again.
 * Failed roots remain for diagnosis; retries require another fresh root.
 */
export async function prepareBaselineSource(
  opts: PrepareBaselineSourceOptions,
): Promise<PreparedBaselineSource> {
  // Pin caller-owned metadata before the first await; never accept a supplied manifest.
  const destinations = parseDestinations(structuredClone(opts.destinations));
  const fingerprint = opts.manifestSha256;
  const selected = opts.sourceDestinationPath;
  const workRoot = opts.workRoot;
  const keys = new Map([...opts.verificationKeys].map(([id, key]) => [id, { ...key }]));
  if (typeof fingerprint !== "string" || !SHA.test(fingerprint))
    throw new Error("EXPECTED_MANIFEST_DIGEST_REQUIRED");
  if (!destinations.some((d) => d.path === selected))
    throw new Error("DECLARED_SOURCE_DESTINATION_REQUIRED");
  await assertFreshDirectory(workRoot);
  assertDisjointPaths([workRoot, ...destinations.map((d) => d.path)]);
  let manifest: ContentManifest | undefined;
  for (const destination of destinations) {
    const verified = await verifyDestination(destination, fingerprint, keys);
    if (destination.path === selected) manifest = verified;
  }
  if (!manifest) throw new Error("DECLARED_SOURCE_DESTINATION_REQUIRED");
  // Decode the current inventorySources layout, not a historical path heuristic.
  // Original roots may be offline: no filesystem access to their recorded paths.
  const originalRoots = new Map<string, string>();
  for (const source of manifest.sourceInventory) {
    const [namespace, ...relative] = source.role.split("/");
    if (!/^source-\d{4,}$/.test(namespace) || !relative.length)
      throw new Error("UNSUPPORTED_BASELINE_SOURCE_LAYOUT");
    let root = source.absolutePath;
    for (const _ of relative) root = path.dirname(root);
    if (path.join(root, ...relative) !== source.absolutePath || root === path.parse(root).root)
      throw new Error("INVALID_BASELINE_SOURCE_ROOT");
    const priorRoot = originalRoots.get(namespace);
    if (priorRoot !== undefined && priorRoot !== root)
      throw new Error("INCONSISTENT_BASELINE_SOURCE_ROOT");
    originalRoots.set(namespace, root);
    assertDisjointPaths([workRoot, root]);
  }
  await assertFreshDirectory(workRoot);
  await fs.mkdir(workRoot, { mode: 0o700 });
  await syncDirectory(path.dirname(workRoot));
  for (const artifact of manifest.artifacts)
    await copyVerifiedFile(
      path.join(selected, artifact.uri),
      path.join(workRoot, artifact.uri),
      artifact,
    );

  // Full final read-back: a copied manifest or receipt is never a substitute for bytes.
  const expectedFiles = manifest.artifacts.map((a) => a.uri).sort();
  if (JSON.stringify(await listFiles(workRoot)) !== JSON.stringify(expectedFiles))
    throw new Error("BASELINE_SOURCE_CLOSURE_MISMATCH");
  const sqliteOriginals = new Set<string>();
  const snapshots = new Set<string>();
  for (const artifact of manifest.artifacts) {
    let header: Buffer | undefined;
    const actual = await inspectRetainedFile(path.join(workRoot, artifact.uri), (chunk) => {
      header ??= Buffer.from(chunk.subarray(0, 20));
    });
    if (actual.sha256 !== artifact.sha256 || actual.bytes !== artifact.bytes)
      throw new Error("BASELINE_SOURCE_OBJECT_MISMATCH");
    const sqlite = header?.subarray(0, 16).equals(Buffer.from("SQLite format 3\0")) ?? false;
    if (artifact.representation === "original") {
      if (sqlite) sqliteOriginals.add(artifact.sourceRole);
    } else {
      // Standalone rollback-journal format, never a WAL main file missing its WAL.
      // Header validation is NOT domain/schema validation or SQLite quick_check.
      if (!sqlite || actual.bytes < 100 || header?.[18] !== 1 || header?.[19] !== 1)
        throw new Error("STANDALONE_BASELINE_SNAPSHOT_REQUIRED");
      snapshots.add(artifact.sourceRole);
    }
  }
  if (
    sqliteOriginals.size !== snapshots.size ||
    [...sqliteOriginals].some((role) => !snapshots.has(role))
  )
    throw new Error("BASELINE_SNAPSHOT_COVERAGE_MISMATCH");
  await syncDirectory(workRoot);
  return Object.freeze({
    root: workRoot,
    manifestSha256: fingerprint,
    manifest: Object.freeze({
      ...manifest,
      sourceInventory: Object.freeze(manifest.sourceInventory.map((entry) => Object.freeze(entry))),
      artifacts: Object.freeze(manifest.artifacts.map((artifact) => Object.freeze(artifact))),
    }),
  });
}
export async function verifyReplicas(opts: VerifyReplicasOptions): Promise<PreservationDiagnostic> {
  const violations: PreservationDiagnostic["violations"] = [];
  const evidenceRefs: string[] = [];
  const fingerprint = typeof opts.manifestSha256 === "string" ? opts.manifestSha256 : "";
  try {
    const destinations = parseDestinations(structuredClone(opts.destinations));
    if (!SHA.test(fingerprint)) throw new Error("EXPECTED_MANIFEST_DIGEST_REQUIRED");
    const keys = new Map([...opts.verificationKeys].map(([id, key]) => [id, { ...key }]));
    for (const dest of destinations) {
      try {
        await verifyDestination(dest, fingerprint, keys);
        evidenceRefs.push(path.join(dest.path, "destination-receipt.json"));
      } catch (error) {
        violations.push({
          code: "UNVERIFIED_REPLICA",
          message: error instanceof Error ? error.message : String(error),
          artifactRef: dest.path,
        });
      }
    }
  } catch (error) {
    violations.push({
      code: "UNVERIFIED_REPLICA",
      message: error instanceof Error ? error.message : String(error),
      artifactRef: "preservation-input",
    });
  }
  return {
    schema: "hdri-preservation@1",
    operation: "preserve:verify",
    status: violations.length ? "incomplete" : "pass",
    inputFingerprint: fingerprint,
    evidenceRefs,
    violations,
  };
}
