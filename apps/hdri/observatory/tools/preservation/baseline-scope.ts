/*
<MODULE_CONTRACT>
<purpose>Check closed baseline source declarations against every prepared snapshot and its actual table inventory.</purpose>
<non-goals><item>Does not authenticate historical producer claims, validate domain rows, materialize targets or grant import admission.</item></non-goals>
<!-- risk: vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Require explicit scope and complete table accounting for each retained snapshot.</item></CHANGE_SUMMARY>
*/
// @ai-invariant: Inventory agreement is not conversion completeness or historical provenance; no success receipt is issued here.
import path from "node:path";
import { TextDecoder } from "node:util";
import { inspectRetainedFile } from "@warpgogol/pipeline-node";
import { assertPreparedBaselineSource, type PreparedBaselineSource } from "./preserve.js";
import { streamPreparedSnapshot, type SnapshotArtifact } from "./prepared-snapshot.js";

const PROFILES = {
  harvest: ["sites", "site_source_seeds", "site_hwo_mappings", "site_cohorts", "site_strata"],
  observatory: ["observations", "asset_id_map"],
  unclassified: [],
} as const;
type Profile = keyof typeof PROFILES;
type TableDeclaration = Readonly<{
  name: string;
  disposition: "required" | "retained-only";
  reason: string | null;
}>;
export type BaselineSourceClaim = Readonly<
  | { status: "unavailable"; reason: string }
  | {
      status: "retained-claim";
      producer: string;
      device: string;
      sourceToken: string;
      signatureUri: string;
      evidenceUris: readonly string[];
    }
>;
export type BaselineSourceDeclaration = Readonly<{
  snapshot: SnapshotArtifact;
  profile: Profile;
  scope: BaselineSourceClaim;
  tables: readonly TableDeclaration[];
}>;
export type BaselineScopeInventory = Readonly<{
  schema: "hdri-baseline-scope-inventory@1";
  manifestSha256: string;
  status: "inventory-checked-not-admitted";
  /** Exact preserved input closure; no artifact is excluded by a table disposition. */
  retainedArtifactCount: number;
  sources: readonly Readonly<{
    declaration: BaselineSourceDeclaration;
    sourceRole: string;
    original: SnapshotArtifact;
    /** Includes views/virtual/shadow tables; required readers must reject unsupported shapes. */
    objects: readonly Readonly<{
      name: string;
      kind: string;
      columns: number;
      withoutRowid: boolean;
    }>[];
  }>[];
}>;
const MAX_SOURCES = 1024;
const MAX_TABLES = 1024;
const MAX_TEXT_BYTES = 4096;
const MAX_DECLARATION_TEXT_BYTES = 8 * 1024 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const scopeInventories = new WeakSet<object>();

/** Reject reconstructed JSON that did not complete this process-local inventory pass. */
export function assertBaselineScopeInventory(
  value: unknown,
): asserts value is BaselineScopeInventory {
  if (!value || typeof value !== "object" || !scopeInventories.has(value))
    throw new Error("PROCESS_LOCAL_BASELINE_SCOPE_INVENTORY_REQUIRED");
}

function object(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== names.length ||
    names.some((name) => {
      const property = Object.getOwnPropertyDescriptor(value, name);
      return !property || !("value" in property);
    })
  )
    throw new Error("INVALID_BASELINE_SCOPE_SHAPE");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Buffer.byteLength(value) > MAX_TEXT_BYTES ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    Buffer.from(value).toString("utf8") !== value
  )
    throw new Error("INVALID_BASELINE_SCOPE_TEXT");
  return value;
}
function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error("BASELINE_SCOPE_ARRAY_LIMIT");
  return Array.from(value);
}

/** Caller data is a declaration, never proof of historical scope. It must cover all
 * prepared snapshots and all non-internal main-schema objects. Required domains
 * are fixed by profile; others stay preserved and explicitly outside this decoder.
 */
export async function inspectBaselineScope(
  prepared: PreparedBaselineSource,
  input: unknown,
): Promise<BaselineScopeInventory> {
  assertPreparedBaselineSource(prepared);
  let declarationBytes = 0;
  const declaredText = (value: unknown): string => {
    const result = text(value);
    declarationBytes += Buffer.byteLength(result);
    if (declarationBytes > MAX_DECLARATION_TEXT_BYTES)
      throw new Error("BASELINE_SCOPE_METADATA_LIMIT");
    return result;
  };
  const envelope = object(input, ["schema", "manifestSha256", "sources"]);
  if (
    envelope.schema !== "hdri-baseline-scope@1" ||
    envelope.manifestSha256 !== prepared.manifestSha256
  )
    throw new Error("BASELINE_SCOPE_MANIFEST_MISMATCH");
  const artifacts = new Map(prepared.manifest.artifacts.map((a) => [a.uri, a]));
  const snapshots = prepared.manifest.artifacts.filter(
    (a) => a.representation === "sqlite-snapshot",
  );
  const seen = new Set<string>();
  // Detach all caller state before the first await; later edits cannot alter the declaration.
  const declarations = array(envelope.sources, MAX_SOURCES).map((value) => {
    const row = object(value, ["snapshot", "profile", "scope", "tables"]);
    const ref = object(row.snapshot, ["uri", "sha256", "bytes"]);
    const uri = declaredText(ref.uri);
    const artifact = artifacts.get(uri);
    if (
      !artifact ||
      artifact.representation !== "sqlite-snapshot" ||
      ref.sha256 !== artifact.sha256 ||
      ref.bytes !== artifact.bytes ||
      seen.has(uri)
    )
      throw new Error("BASELINE_SCOPE_SNAPSHOT_MISMATCH");
    seen.add(uri);
    if (typeof row.profile !== "string" || !Object.hasOwn(PROFILES, row.profile))
      throw new Error("UNKNOWN_BASELINE_SCOPE_PROFILE");
    const profile = row.profile as Profile;
    let scope: BaselineSourceClaim;
    const status = Object.getOwnPropertyDescriptor(row.scope ?? {}, "status")?.value;
    if (status === "unavailable") {
      const claim = object(row.scope, ["status", "reason"]);
      scope = Object.freeze({ status, reason: declaredText(claim.reason) });
    } else if (status === "retained-claim") {
      const claim = object(row.scope, [
        "status",
        "producer",
        "device",
        "sourceToken",
        "signatureUri",
        "evidenceUris",
      ]);
      const refs = array(claim.evidenceUris, 64).map(declaredText);
      const signatureUri = declaredText(claim.signatureUri);
      if (
        !refs.length ||
        new Set(refs).size !== refs.length ||
        refs.some((uri) => !artifacts.has(uri)) ||
        !refs.includes(signatureUri) ||
        artifacts.get(signatureUri)?.representation !== "original"
      )
        throw new Error("BASELINE_SCOPE_EVIDENCE_UNLISTED");
      scope = Object.freeze({
        status,
        producer: declaredText(claim.producer),
        device: declaredText(claim.device),
        sourceToken: declaredText(claim.sourceToken),
        signatureUri,
        evidenceUris: Object.freeze(refs),
      });
    } else throw new Error("INVALID_BASELINE_SCOPE_CLAIM");
    const names = new Set<string>();
    const required = new Set<string>(PROFILES[profile]);
    const tables = array(row.tables, MAX_TABLES).map((value) => {
      const table = object(value, ["name", "disposition", "reason"]);
      const name = declaredText(table.name);
      if (names.has(name) || name.startsWith("sqlite_"))
        throw new Error("DUPLICATE_OR_INTERNAL_SCOPE_TABLE");
      names.add(name);
      if (required.has(name)) {
        if (table.disposition !== "required" || table.reason !== null)
          throw new Error("REQUIRED_BASELINE_DOMAIN_OMITTED");
        return Object.freeze({ name, disposition: "required" as const, reason: null });
      }
      if (table.disposition !== "retained-only")
        throw new Error("UNSUPPORTED_REQUIRED_BASELINE_DOMAIN");
      return Object.freeze({
        name,
        disposition: "retained-only" as const,
        reason: declaredText(table.reason),
      });
    });
    if ([...required].some((name) => !names.has(name)))
      throw new Error("REQUIRED_BASELINE_DOMAIN_OMITTED");
    return Object.freeze({
      snapshot: Object.freeze({ uri, sha256: artifact.sha256, bytes: artifact.bytes }),
      profile,
      scope,
      tables: Object.freeze(tables),
    });
  });
  if (seen.size !== snapshots.length || snapshots.some((a) => !seen.has(a.uri)))
    throw new Error("INCOMPLETE_BASELINE_SNAPSHOT_SCOPE");

  const sources: BaselineScopeInventory["sources"][number][] = [];
  const originals = new Map(
    prepared.manifest.artifacts
      .filter((a) => a.representation === "original")
      .map((a) => [a.sourceRole, a]),
  );
  for (const declaration of declarations) {
    const objects: BaselineScopeInventory["sources"][number]["objects"][number][] = [];
    for await (const entry of streamPreparedSnapshot(
      prepared,
      declaration.snapshot.uri,
      "BASELINE",
      function* (db) {
        if (db.pragma("encoding", { simple: true }) !== "UTF-8")
          throw new Error("UNSUPPORTED_BASELINE_SCOPE_ENCODING");
        const rows =
          db.prepare(`SELECT CASE WHEN octet_length(name)<=4096 THEN CAST(name AS BLOB) END AS name,
        type AS kind,ncol AS columns,wr FROM pragma_table_list WHERE schema='main' AND substr(name,1,7)<>'sqlite_'`);
        let count = 0;
        for (const raw of rows.iterate() as Iterable<{
          name: Buffer | null;
          kind: string;
          columns: number;
          wr: number;
        }>) {
          if (++count > MAX_TABLES) throw new Error("BASELINE_SCOPE_TABLE_LIMIT");
          if (!raw.name) throw new Error("BASELINE_SCOPE_TABLE_NAME_LIMIT");
          const name = text(utf8.decode(raw.name));
          yield Object.freeze({
            name,
            kind: raw.kind,
            columns: raw.columns,
            withoutRowid: raw.wr === 1,
          });
        }
      },
    ))
      objects.push(entry);
    const actual = new Set(objects.map((o) => o.name));
    if (
      actual.size !== declaration.tables.length ||
      declaration.tables.some((t) => !actual.has(t.name))
    )
      throw new Error("INCOMPLETE_BASELINE_TABLE_SCOPE");
    const sourceRole = artifacts.get(declaration.snapshot.uri)!.sourceRole;
    const original = originals.get(sourceRole);
    if (!original) throw new Error("BASELINE_SCOPE_ORIGINAL_MISSING");
    sources.push(
      Object.freeze({
        declaration,
        sourceRole,
        original: Object.freeze({
          uri: original.uri,
          sha256: original.sha256,
          bytes: original.bytes,
        }),
        objects: Object.freeze(
          objects.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name))),
        ),
      }),
    );
  }
  // Recheck the complete retained byte closure, including provenance claims and
  // original DB/WAL/CAS files as bytes only. Never open originals with SQLite.
  for (const artifact of prepared.manifest.artifacts) {
    const actual = await inspectRetainedFile(path.join(prepared.root, artifact.uri));
    if (actual.sha256 !== artifact.sha256 || actual.bytes !== artifact.bytes)
      throw new Error("BASELINE_SCOPE_ARTIFACT_CHANGED");
  }
  const result = Object.freeze({
    schema: "hdri-baseline-scope-inventory@1",
    manifestSha256: prepared.manifestSha256,
    status: "inventory-checked-not-admitted",
    retainedArtifactCount: artifacts.size,
    sources: Object.freeze(sources),
  });
  scopeInventories.add(result);
  return result;
}
