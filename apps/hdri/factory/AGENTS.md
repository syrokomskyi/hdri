# HDRI Factory Pipeline — Local Guide

This file provides AI agent guidance specific to the `apps/hdri/factory` pipeline chain. Apply these rules in addition to the general `apps/AGENTS.md` guidelines.

## Locality invariant (hard rule)

Every app under `apps/hdri/factory/<N>-<name>/` **writes only to its own `.output/`**. Reading from a sibling app's `.output/` is allowed in read-only mode via an explicit path declared in `brief.md`. Writes into another app's folder are bugs — fix them immediately.

## Database naming rule (hard rule)

Mutable catalog and registry databases are year-scoped. Every observation database is **quarter-scoped** with lowercase `YYYY-qN`; Q3 and Q4 must never share a writable database.

Examples: `core_2026.db`, `registry_2026.db`, `liveness-2026-q3.db`, `pages-2026-q3.db`, `lighthouse-2026-q3.db`, `axe-2026-q3.db`.

When updating `brief.md` for a new year, also update any downstream `brief.md` files that reference the path.

## Upstream evidence and target identity guards (hard rule)

Before opening an upstream observation database, derive its canonical path from the current period, upstream app, and device, then require the configured brief path to match it exactly. Verification and consumption must never use independent path authorities.

Before network or browser work, require a one-to-one mapping between `domain` and `provisionalAssetId`. Duplicate or conflicting targets must pause the pipeline; never silently deduplicate or choose one row.

## Quarterly evidence closure (hard rule)

Frozen source projections are period-scoped and immutable. Commit the signed frame guard before publishing `frame-YYYY-qN.json` and `source-occurrences-YYYY-qN.ndjson`; a conflicting retry must leave both prior files unchanged. The ontology bridge must verify every source signature, ledger head, included batch set and occurrence hash before retaining any source bytes.

Long-running network and browser attempts renew their filesystem lease through append-only heartbeats. Every stage retains its frozen target set and an Ed25519-signed completeness seal; both are included in the quarterly capsule. The ontology bridge must refuse emission unless every required stage proves the same target hash and result-set hash across its target artifact, event journal, CAS objects and signed seal. `maxDomains` runs intentionally remain unsealed and therefore cannot enter a staging or final capsule.

A historical frame head covers exactly its signed `includedBatchIds`. Later quarter segments may coexist in the source ledger but must neither alter nor invalidate verification of an earlier frame. Retained source bytes are checked against hashes captured during verification; never establish the expected hash by rereading a potentially changed source after preflight.

## Cumulative discovery contract (RFC-0030)

`bootstrapBatches()` in `0-harvest-source` uses two-phase discovery:

1. **Prior capsule segments**: Read from `prior-capsules.json` in the shared `.input/` directory. Each entry references a sealed capsule manifest with batch IDs from prior quarters. Raw folder scanning of `.input/batches` for prior-quarter folders is **forbidden**.
2. **Current batch**: Verify the current quarter's folder exists under `.input/batches/<sourceToken>/` via `fs.stat` only — no `readdir`.

The combined batch set (prior batch IDs + current sourceToken) is passed to the pipeline as `LedgerDiscoveryResult`. Single-folder scanning of `.input/batches` for prior quarters is explicitly forbidden.

## Pre-flight consistency guard (RFC-0043)

`0-harvest-source/run/app/run-app.ts` calls `validateBriefConsistency()` from `@syrokomskyi/factory-core` after `bootstrapBrief()` and before `bootstrapBatches()`. The guard checks:

1. `capsuleId` matches across factory root brief, `a-contract-ontology` brief, and observatory brief.
2. `sourceToken` period matches `contractOntologyBrief.period` and `observatoryBrief.period`.
3. `prior-capsules.json` exists unless `--first-quarter` / `FIRST_QUARTER=true` is set.
4. `capsuleId` is not reused from a prior quarter (checked against `prior-capsules.json` entries).

If any check fails, the pipeline pauses with an actionable error message. All three briefs must be set up before running any factory pipeline per the RUNBOOK pre-flight checklist.

When reading sibling app briefs (contract ontology, observatory), use `gray-matter` to extract raw frontmatter fields directly from the `.input/brief.md` file. Do not import sibling app brief parsers — cross-app imports are forbidden by AGENTS.md package rules. Only extract the minimal fields needed (`capsuleId`, `period`).

## Source batch admission (RFC-0102)

Source batches are admitted with verified parsers and measured yield. Three mechanisms enforce this:

1. **Per-file receipts**: Each parsed file gets a `SourceFileReceipt` stored in `source_file_stats` with `content_sha256`, `parser_id`, `parser_version`, and `dependency_fingerprint`. Resume logic skips a file only if all four fields match the existing row. Pre-migration rows (NULL `content_sha256`) are always re-parsed.

2. **Parser routing**: `getParserForSource` uses deepest-match routing. Nested external-host boundaries route to `UnknownSourceParser` instead of inheriting the parent's parser. Known source family patterns (e.g. `stadtbranchenbuch` subdomains) are always checked down to segment 1.

3. **Per-source yield gate**: `checkPerSourceYield` runs before sealing. Each source folder must produce at least one accepted seed unless declared as `"declared-noise"` in `brief.md` frontmatter `sourceDisposition` map. A large prior registry does not bypass this check.

The `batch-estimate` script supports `--mode json` and `--baseline-manifest <path>` for yield comparison against a prior capsule manifest.

## Pipeline structure

The factory pipeline is a chain of **workspace applications**, not a single monolithic app. Each is a **crawl factory** component — it collects raw signals and emits them for downstream consumption by `apps/hdri/observatory`.

- **0-harvest-source**: Ingests source files (CSV/HTML/MHTML), parses business data, enriches bundesland, classifies gewerk_group. Outputs `core_YYYY.db`.
- **1-register-businesses**: Preserves device-local rows and deterministic provisional `da-*` IDs. Canonical cross-quarter identity is a UUID v7 minted once in the Observatory identity registry.
- **2-check-liveness**: Checks site reachability via HTTP. Outputs `liveness-YYYY-qN.db` keyed by provisional asset ID.
- **3-extract-profile**: Crawls sites and writes `pages-YYYY-qN.db`.
- **4-audit-lighthouse**: Optional quarterly Lighthouse audit. It is explicitly disabled for Q3 2026.
- **5-audit-axe**: Runs quarterly Axe audits and outputs `axe-YYYY-qN.db`.

**Note:** HDRI scoring and publication live in `apps/hdri/observatory`, not here.

Each app has its own `run/` directory, brief.md, and gogol registry. Run workspace commands from the monorepo root with `pnpm turbo ...`.

## Database contracts

### core.db (0-harvest-source)

- `sites(id, domain, gewerk_group, bundesland, gemeinde)` — master site catalog
- `site_pages(id, site_id, url_norm, url_sha256)` — URL registry
- `site_source_seeds(id, site_id, batch_id, source_path, ...)` — provenance
- `source_file_stats(source_path PRIMARY KEY, items_parsed, items_registered, items_skipped, no_url_warnings, no_url, bad_url, stop_domain, content_sha256, parser_id, parser_version, dependency_fingerprint)` — per-file receipts (RFC-0102)
- `site_cohorts(id, description, ...)` — cohort definitions
- `site_strata(cohort_id, site_id, gewerk_group, bundesland, ...)` — cohort membership

### pages-YYYY-qN.db (3-extract-profile)

- `page_observations(site_page_id, content_sha256, observed_at, ...)` — crawl log
- `page_contents(sha256, storage_path, byte_size)` — CAS for HTML
- `ext_*` tables (42 flat tables) — one per signal type, schema: `(content_sha256, present, extractor_ver, ...)`

### axe-YYYY-qN.db and lighthouse-YYYY-qN.db

- `audit_runs(tool, provisional_asset_id, site_id, ok, ...)` — audit log; `site_id` is diagnostic only
- `lighthouse_runs(provisional_asset_id, ...)` — Lighthouse metrics
- `axe_runs(provisional_asset_id, ...)` — axe violation counts

## ext\_\* flat table schema

The extraction pipeline uses 42 flat `ext_*` tables instead of the legacy `content_extractions` and `content_contacts` tables. Most tables share this schema:

```sql
CREATE TABLE ext_<signal> (
  content_sha256 TEXT NOT NULL,
  present INTEGER NOT NULL,
  extractor_ver TEXT NOT NULL,
  -- signal-specific columns
  PRIMARY KEY (content_sha256, extractor_ver)
);
```

Examples:

- `ext_impressum(content_sha256, present, extractor_ver, url, confidence)`
- `ext_datenschutz(content_sha256, present, extractor_ver, url, confidence)`
- `ext_opening_hours(content_sha256, present, extractor_ver, text)`
- `ext_contact_form(content_sha256, present, extractor_ver)`

When reading extraction data, always use `ext_*` tables. Join via `page_observations(content_sha256) → ext_*.content_sha256`. Use the `MAX(extractor_ver)` subquery pattern to get the latest extraction version.

## Gogol naming conventions

- Gogol IDs use kebab-case: `crawl-pages`, `extract-impressum`, `summarize-profile`.
- Phase IDs use kebab-case: `harvest`, `check-liveness`, `extract-profile`, `audit`, `score`, `publish`.
- Database tables use snake_case: `site_strata`, `page_observations`, `ext_impressum`.
- TypeScript types use PascalCase: `SiteRow`, `ExtractionRow`, `PipelineContext`.

## Stratified sampling

The scoring cohort uses stratified sampling by `(gewerk_group × bundesland)`. When applying `maxSites` quota:

1. Group sites by stratum key
2. Shuffle each stratum deterministically using seeded RNG
3. Allocate quota proportionally: `floor(stratum_size * maxSites / total_sites)`
4. Distribute remaining slots to largest strata

This ensures balanced representation across gewerk and state combinations.

## Privacy and k-anonymity

The publication pipeline enforces k-anonymity:

- Default mode is `enforce` (fail if any stratum has < effective k=12 sites)
- Override to `warn` only for development
- Publication mode `public` omits identifying data (domain, gewerk, bundesland, real site_id)
- Publication mode `internal` includes identifying data for internal use

When adding new publication artifacts, check `publicationMode` and omit identifying columns in public mode.

## Common patterns

### Reading from upstream databases

When a gogol needs data from an upstream database:

```typescript
const safePath = dbPath.replace(/\\/g, '/').replace(/'/g, "''");
db.prepare(`ATTACH DATABASE '${safePath}' AS upstream`).run();
// Query using upstream.table_name
db.prepare(`DETACH DATABASE upstream`).run();
```

### Deterministic RNG for sampling

Use the FNV-1a + mulberry32 pattern for deterministic shuffling:

```typescript
const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
```

## Shared base classes and helpers

Audit gogols (4-audit-lighthouse, 5-audit-axe) and crawl gogols (3-extract-profile) share common logic via two packages:

### @syrokomskyi/pipeline-steps

- **`CaptureEnvironmentProfileStep`** — abstract base for environment profile capture. Subclass overrides `getBriefSnapshot(ctx)` and `getSkipGogols(ctx)`. Base class owns system info, tool version probing, JSON + Markdown artifacts.
- **`SummarizeAuditStep<TContext, TStats>`** — generic abstract base for audit snapshot reports. Subclass provides tool-specific `TStats` type, DB access methods, and formatting. Base class owns snapshot creation, SHA-256 hashing, and report writing.

### @syrokomskyi/factory-core

- **`loadLiveAuditTargets(registryDb, livenessDb, sampleSize, toolName?)`** — shared audit-target loader. Returns `AuditTarget[]` from registry + liveness DBs.
- **`upsertAuditRun(db, envelope)`** — idempotent upsert for `audit_runs` table.
- **`AuditTarget`** type — re-exported from both audit apps' `types.ts` instead of duplicated locally.

### App-local helpers (3-extract-profile)

- **`db/page-helpers.ts`** — shared page-DB helpers (`normalisePageUrl`, `sha256Hex`, `upsertPageContent`, `upsertSitePage`, `getOrCreateSitePage`, `upsertPageObservation`). Used by both `CrawlGogol` and `FetchDetectedPagesGogol`.

When adding a new audit or crawl gogol, extend the relevant base class or import the shared helpers instead of duplicating logic.

## Anti-patterns

- Do not read from legacy `content_extractions` or `content_contacts` tables — use `ext_*` tables.
- Do not hardcode cohort IDs — resolve from `site_cohorts` or accept via brief.
- Do not skip k-anonymity enforcement in production — default to `enforce` mode.
- Do not publish identifying data in public mode — use `publicationMode` guard.
- Do not apply `maxSites` quota before stratification — allocate proportionally after shuffling.

## Testing

- Apps that import gogol files (e.g. `LighthouseAuditGogol.ts`, `AxeAuditGogol.ts`) in tests must load `apps/hdri/.env` via `dotenv` in their `vitest.config.ts` — gogol imports trigger `getDeviceId()` at module load time, which throws without `DEVICE_ID`.
- Pattern: `import { config } from "dotenv"; config({ path: "apps/hdri/.env" });` at the top of `vitest.config.ts`.

## Program Gate (RFC-0099)

The 2026-09-13 integration review found that the contracts below are not fully
wired into the live chain. Read `docs/reviews/code/apps-hdri/review-2026-09-12-23-55-apps-hdri.md`
and the draft corrective sequence RFC-0113–0115 before modifying this area.
Do not infer operational readiness from a terminal RFC status or a helper test.

Every factory app's `run-app.ts` calls `evaluateProgramGate()` from `@syrokomskyi/factory-core` after `bootstrapBrief()` and before `runPipelineEngine()`. The gate uses operation `"collect"` for factory apps.

### Fail-closed contract

- Without preservation and collection readiness evidence, the gate blocks the run with stable blocker codes (`NO_PRESERVATION_RECEIPT`, `NO_COLLECTION_READINESS`).
- Mutating entry points fix operation to collect; environment variables cannot select diagnostic admission. Only separate read-only diagnostics are ungated.
- Bootstrap state (all refs `null`) correctly blocks — this is the intended initial behavior per AC-5.
- Verified receipt loading remains unimplemented; do not populate refs with unchecked paths or strings.

## Crash-safe execution (RFC-0101)

The durable helper exposes the intended SQLite execution contract, but existing
collectors still use the older execution store. RFC-0114 proposes the cutover;
the invariants below are requirements, not claims that all callers meet them.
The current helper rejects conflicting measurement rewrites and never revives an
older epoch after a newer epoch is released.

### Execution-state invariants

- Event ordering is determined by SQLite autoincrement sequence, not wall-clock time. Wall-clock regression does not affect replayed work state.
- Lease epochs are monotonically increasing and allocated in the same transaction as ownership. A stale worker with an old epoch cannot commit terminal results or release a newer lease.
- Measurement evidence is immutable: `measuredAt` is recorded once at first capture and preserved across replays. Replay reconstructs SQLite projections using the original timestamp.
- Sealed journal segments carry ordered events and predecessor digests. Compaction writes verified immutable segments plus a rebuildable bounded index — no deletion of unreplicated evidence.
- `MeasurementEvidence.contentRefs` are CAS SHA-256 digests of evidence artifacts stored via `writeExecutionCasObject`.
- Dependency fingerprints from RFC-0094 are included in every measurement. A changed output-affecting dependency invalidates declared consumers.
- Crash recovery: if execution stops at any publication failpoint, restart exposes either complete verified evidence or an explicit incomplete state — never partial or corrupt state.

## Egress boundary and preflight (RFC-0103)

- All HTTP acquisition in `2-check-liveness` and `3-extract-profile` is bounded by wire byte limits (default 2 MiB) and decoded byte limits (default 4 MiB). Responses exceeding limits are truncated and marked `complete: false`.
- Egress policy denies private addresses, loopback, link-local, multicast, and reserved IP ranges by default. IPv6 denials are enabled when `includeIpv6` is true.
- `robots.txt` handling is fail-closed: 404/410 means absent (allowed); network error or 5xx means unavailable (deferred, NOT allowed). The retrieved robots policy bytes, status, timestamp, and user-agent are preserved in `RobotsDecision`.
- Collector health state machine pauses acquisition after 2 consecutive sentinel failures or when collector-owned failures exceed 50% of recent attempts (window: 100). Resume requires 2 consecutive successes.
- Preflight (`capture:preflight` npm script) checks sentinels, runtime dependencies, clock sanity, egress enforcement, and storage budget (minimum 1 GiB free disk). Exits 0 on pass, non-zero on blocked. JSON diagnostic output includes `violations` with stable codes for each blocker.
- `HttpEvidence` is persisted through the existing `writeExecutionCasObject` mechanism from `@syrokomskyi/factory-core`. No changes to `pipeline-core` or `pipeline-node` are required.

## Profile closure (RFC-0104)

The `3-extract-profile` app follows a frozen internal stage graph:

```
homepage-capture → link-discovery → detected-page-capture → signal-extraction → profile-closure
```

### Stage graph

- Each stage has a distinct `stageId` in the execution journal (`homepage-capture`, `detected-page-capture` added to `WorkKey` union type).
- `CrawlGogol` declares `homepage-capture` stage targets and seals the stage without closing the profile instrument.
- Profile closure requires all four child seals: homepage-capture, link-discovery, detected-page-capture, signal-extraction.

### Context-keyed extraction

- All `ext_*` tables use composite primary key `(asset_id, page_observation_id, effective_url, content_sha256, extractor_ver, policy_hash)`.
- Identical HTML at two origins retains separate owners — no content-hash-only deduplication.
- Detected-page ownership uses explicit context key from ext_* rows, not `LIMIT 1` guessing.

### Pagination and checkpointing

- Extraction runner processes at most 256 pending rows per batch with keyset pagination.
- Full-table result accumulation remains a review finding; do not claim bounded
  execution from paginated input reads alone.

### Coverage diagnostic

- `pnpm --filter @syrokomskyi/site-profile profile:coverage --db <existing-profile.db> [--json]` reports existing `ext_*` row counts using a read-only connection. It does not verify the expected work set, capsule closure or signed evidence.

## RFC-0106: Translate only verified immutable HDRI evidence

Source admission is manifest-based only. `DiscoverSourcesGogol` requires `inputManifestSet` in `brief.md` and calls `validateManifestSet()` from `@syrokomskyi/factory-core` to verify period, capsuleId, stage seals, and safe artifact refs before admitting any upstream database.

`TranslateOntologyGogol` computes a `TranslationClosure` comparing expected signal keys (from `EXT_SIGNAL_MAP`, `AXE_SIGNAL_MAP`, and liveness) against emitted keys in the observation DB. The closure records `expectedKeysSha256`, `emittedKeysSha256`, `sourceSnapshots`, and `unresolvedReferences`.

`EmitBundleGogol` refuses emission unless `translationClosure` exists, has zero unresolved references, and expected/emitted key hashes match.

The `--verify-inputs` CLI flag runs `validateManifestSet` in read-only diagnostic mode, emitting JSON with `{ schema, operation, status, inputFingerprint, evidenceRefs, violations }`.
