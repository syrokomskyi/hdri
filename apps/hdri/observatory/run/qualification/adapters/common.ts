/*
<MODULE_CONTRACT>
  <purpose>Shared helpers for the thirteen production qualification adapters: argument parsing, deterministic fixture access, atomic/CAS writes, fault acknowledgement and stage-verification emission.</purpose>
  <non-goals>
    <item>Does not implement stage domain logic — each adapter composes real production modules.</item>
    <item>Does not weaken isolation — adapters only see /runtime, /input/fixtures and /scratch.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: production adapter support library for the rehearsal runtime closure.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: A fault acknowledgement is written before the controlled exit; never fake acknowledgement after the fact.

import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

/** Controlled-exit code a producer uses after acknowledging a scheduled fault. */
export const FAULT_EXIT_CODE = 75;

export const FAULT_BOUNDARIES = [
  "cas-write",
  "event-transaction",
  "final-publication",
  "extraction-checkpoint",
  "scientific-report",
  "replica-copy",
  "public-promotion",
] as const;
export type FaultBoundary = (typeof FAULT_BOUNDARIES)[number];

export type AdapterArgs = {
  stage: string;
  targets: number;
  mode: "produce" | "verify";
  fixtureRoot: string;
  workRoot: string;
  inputFingerprint: string;
  consumedSha256: string;
  faultBoundary: FaultBoundary | null;
  faultAttempt: number;
  browserSlots: number;
};

export function parseAdapterArgs(argv: readonly string[] = process.argv.slice(2)): AdapterArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--"))
      throw new Error(`ADAPTER_ARGS_MALFORMED:${key ?? "<eof>"}`);
    if (args.has(key)) throw new Error(`ADAPTER_ARGS_DUPLICATE:${key}`);
    args.set(key, value);
  }
  const required = [
    "--stage",
    "--targets",
    "--mode",
    "--fixture-root",
    "--work-root",
    "--input-fingerprint",
    "--consumed",
    "--fault-attempt",
    "--browser-slots",
  ];
  for (const key of required) if (!args.has(key)) throw new Error(`ADAPTER_ARGS_MISSING:${key}`);
  const targets = Number(args.get("--targets"));
  const faultAttempt = Number(args.get("--fault-attempt"));
  const browserSlots = Number(args.get("--browser-slots"));
  if (!Number.isSafeInteger(targets) || targets <= 0) throw new Error("ADAPTER_ARGS_TARGETS");
  if (!Number.isSafeInteger(faultAttempt) || faultAttempt <= 0)
    throw new Error("ADAPTER_ARGS_FAULT_ATTEMPT");
  if (!Number.isSafeInteger(browserSlots) || browserSlots < 1 || browserSlots > 4)
    throw new Error("ADAPTER_ARGS_BROWSER_SLOTS");
  const mode = args.get("--mode");
  if (mode !== "produce" && mode !== "verify") throw new Error("ADAPTER_ARGS_MODE");
  const faultBoundary = args.get("--fault-boundary") ?? null;
  if (faultBoundary !== null && !FAULT_BOUNDARIES.includes(faultBoundary as FaultBoundary))
    throw new Error(`ADAPTER_ARGS_FAULT_BOUNDARY:${faultBoundary}`);
  const parsed: AdapterArgs = {
    stage: args.get("--stage")!,
    targets,
    mode,
    fixtureRoot: args.get("--fixture-root")!,
    workRoot: args.get("--work-root")!,
    inputFingerprint: args.get("--input-fingerprint")!,
    consumedSha256: args.get("--consumed")!,
    faultBoundary: faultBoundary as FaultBoundary | null,
    faultAttempt,
    browserSlots,
  };
  // Every adapter starts here — establish the stage workspace before any
  // SQLite open or file write can race a missing directory.
  fs.mkdirSync(path.join(parsed.workRoot, parsed.stage), { recursive: true });
  return parsed;
}

// ── Deterministic fixture manifest ──────────────────────────────────────────

export type FixtureManifest = {
  schema: "hdri-rehearsal-fixture@1";
  seed: number;
  targets: number;
  frozenTime: string;
  period: string;
  runId: string;
  signingKey: {
    privateKeyPem: string;
    publicKeyPem: string;
    signingKeyId: string;
    collectorId: string;
  };
  files: { uri: string; bytes: number; sha256: string }[];
};

export function loadFixtureManifest(fixtureRoot: string): FixtureManifest {
  const raw = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, "fixture-manifest.json"), "utf8"),
  ) as FixtureManifest;
  if (raw.schema !== "hdri-rehearsal-fixture@1") throw new Error("FIXTURE_MANIFEST_SCHEMA");
  return raw;
}

export function openCorpus(fixtureRoot: string): Database.Database {
  const db = new Database(path.join(fixtureRoot, "corpus.sqlite"), { readonly: true });
  db.pragma("query_only = ON");
  return db;
}

// ── Deterministic helpers ────────────────────────────────────────────────────

export const sha256Hex = (data: string | Buffer | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Stream a file through SHA-256. `fsp.readFile` materialises the whole file as a
 * single Buffer and throws ERR_FS_FILE_TOO_LARGE past 2 GiB — stage outputs such
 * as translation/observations.sqlite exceed that at 200k targets.
 */
export const sha256File = async (abs: string): Promise<string> => {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(abs)) hash.update(chunk);
  return hash.digest("hex");
};

/** Deterministic UUIDv7-shaped id derived from a namespaced string. */
export const deterministicId = (namespace: string, key: string): string => {
  const hex = sha256Hex(`${namespace}:${key}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

/** Deterministic ed25519 fixture keypair derived from the fixture seed (PKCS8 DER seed import). */
export function fixtureSigningKey(seed: number): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const keySeed = createHash("sha256").update(`hdri-rehearsal-signing:${seed}`).digest();
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), keySeed]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
  };
}

// ── Atomic and content-addressed writes ──────────────────────────────────────

export async function writeAtomic(file: string, data: Buffer | string): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  const handle = await fsp.open(tmp, "wx");
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsp.rename(tmp, file);
}

export const writeJsonAtomic = (file: string, value: unknown): Promise<void> =>
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);

/** Append one JSON line to a projection stream (deterministic order is the caller's job). */
export async function appendJsonl(file: string, row: unknown): Promise<void> {
  // Synchronous writes: callers fire-and-forget (`void appendJsonl`) inside sync
  // db.transaction callbacks, so async appendFile would race and reorder lines
  // across runs — breaking byte-identical resume-equivalence proofs.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
}

/** Content-addressed write under <stageDir>/cas/<2-hex>/<sha256>; idempotent. */
export async function casWrite(
  stageDir: string,
  bytes: Buffer,
): Promise<{ uri: string; sha256: string; bytes: number }> {
  const digest = sha256Hex(bytes);
  const rel = path.join("cas", digest.slice(0, 2), digest);
  const abs = path.join(stageDir, rel);
  if (!fs.existsSync(abs)) await writeAtomic(abs, bytes);
  return { uri: rel, sha256: digest, bytes: bytes.length };
}

// ── Fault acknowledgement ────────────────────────────────────────────────────

/**
 * Acknowledge a scheduled fault at a real operation boundary: persist which
 * boundary was reached and how much committed work preceded it, then exit with
 * the controlled fault code so the controller can record and interrupt.
 */
export async function ackFault(
  args: AdapterArgs,
  boundary: FaultBoundary,
  detail: Record<string, unknown>,
): Promise<never> {
  // /scratch maps to <evidenceRoot>/work — a "work/<stage>/…" URI is <stage>/… here.
  const file = path.join(args.workRoot, args.stage, `fault-${boundary}.json`);
  await writeJsonAtomic(file, {
    schema: "hdri-stage-fault@1",
    stage: args.stage,
    boundary,
    attempt: args.faultAttempt,
    inputFingerprint: args.inputFingerprint,
    consumedSha256: args.consumedSha256,
    ...detail,
  });
  process.exit(FAULT_EXIT_CODE);
}

// ── Stage verification emission ──────────────────────────────────────────────

export type OutputProof = { uri: string; bytes: number; sha256: string };

/** Map a declared "work/…" output URI to its path inside the sandbox scratch root. */
export const scratchPath = (workRoot: string, uri: string): string =>
  path.join(workRoot, uri.replace(/^work\//, ""));

export async function proveOutputs(
  workRoot: string,
  uris: readonly string[],
): Promise<OutputProof[]> {
  const proofs: OutputProof[] = [];
  for (const uri of uris) {
    const abs = scratchPath(workRoot, uri);
    const stat = await fsp.stat(abs);
    if (!stat.isFile() || stat.size === 0) throw new Error(`MISSING_STAGE_OUTPUT:${uri}`);
    proofs.push({ uri, bytes: stat.size, sha256: await sha256File(abs) });
  }
  return proofs;
}

/** Print the hdri-stage-verification@1 verdict the controller checks byte-for-byte. */
export function emitVerification(args: AdapterArgs, outputs: readonly OutputProof[]): void {
  process.stdout.write(
    `${JSON.stringify({
      schema: "hdri-stage-verification@1",
      stage: args.stage,
      status: "pass",
      targets: args.targets,
      inputFingerprint: args.inputFingerprint,
      consumedSha256: args.consumedSha256,
      outputs,
    })}\n`,
  );
}

export function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

// ── Fixture transport boundary ───────────────────────────────────────────────
// External sites are replaced ONLY at the transport boundary (RFC-0111): the
// fetch below serves corpus bytes with real Response semantics — streaming
// body, headers, status and final URL — while the production liveness/fetch
// logic above it runs unchanged.

export type CorpusSite = {
  seq: number;
  domain: string;
  bundesland: string;
  destatis_group: string;
  live: number;
  http_status: number;
  redirect_to: string | null;
};

const PAGE_PATHS: Record<string, string> = {
  "/": "home",
  "/impressum": "impressum",
  "/impressum/": "impressum",
  "/datenschutz": "datenschutz",
  "/datenschutz/": "datenschutz",
  "/kontakt": "contact",
  "/kontakt/": "contact",
};

function fetchLikeError(code: string, message: string): Error {
  const cause = Object.assign(new Error(message), { code });
  return new TypeError("fetch failed", { cause });
}

/**
 * Builds a fetch-compatible function backed by the fixture corpus. Only the
 * transport is substituted; status codes, redirects, streaming bodies and
 * failure modes behave like real HTTP responses.
 */
export function fixtureFetch(corpus: Database.Database): typeof fetch {
  const siteByDomain = corpus.prepare("SELECT * FROM sites WHERE domain = ?");
  const pageBySite = corpus.prepare("SELECT html FROM pages WHERE site_seq = ? AND kind = ?");
  const resolve = (rawUrl: string): { site: CorpusSite; kind: string; url: URL } => {
    const url = new URL(rawUrl);
    const host = url.hostname;
    let site = siteByDomain.get(host) as CorpusSite | undefined;
    if (!site && host.startsWith("www.")) {
      site = siteByDomain.get(host.slice(4)) as CorpusSite | undefined;
    }
    if (!site) throw fetchLikeError("ENOTFOUND", `getaddrinfo ENOTFOUND ${url.hostname}`);
    const kind = PAGE_PATHS[url.pathname] ?? "home";
    return { site, kind, url };
  };
  return (async (input: unknown, init?: { method?: string; signal?: AbortSignal }) => {
    const rawUrl = typeof input === "string" ? input : String(input);
    const { site, kind, url } = resolve(rawUrl);
    if (!site.live) {
      if (site.http_status === 0)
        throw fetchLikeError("ENOTFOUND", `getaddrinfo ENOTFOUND ${site.domain}`);
      throw fetchLikeError("ECONNREFUSED", `connect ECONNREFUSED ${site.domain}`);
    }
    // Redirect: bare domain → www when the fixture declares it.
    let finalUrl = rawUrl;
    if (site.redirect_to && url.hostname === site.domain) {
      finalUrl = `${url.protocol}//${site.redirect_to}${url.pathname}`;
    }
    const isHead = init?.method === "HEAD";
    const row = pageBySite.get(site.seq, kind) as { html: Buffer } | undefined;
    const status = row ? site.http_status : 404;
    const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
    const body = isHead || !row ? null : new Uint8Array(row.html);
    const response = new Response(body, { status, headers });
    Object.defineProperty(response, "url", { value: finalUrl });
    Object.defineProperty(response, "redirected", { value: finalUrl !== rawUrl });
    return response;
  }) as unknown as typeof fetch;
}
