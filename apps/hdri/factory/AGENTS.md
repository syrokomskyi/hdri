# HDRI Factory Pipeline — Local Guide

This file provides AI agent guidance specific to the `apps/hdri/factory` pipeline chain. Apply these rules in addition to the general `apps/AGENTS.md` guidelines.

## Locality invariant (hard rule)

Every app under `apps/hdri/factory/<N>-<name>/` **writes only to its own `.output/`**. Reading from a sibling app's `.output/` is allowed in read-only mode via an explicit path declared in `brief.md`. Writes into another app's folder are bugs — fix them immediately.

## Database naming rule (hard rule)

Mutable catalog and registry databases are year-scoped. Every observation database is **quarter-scoped** with lowercase `YYYY-qN`; Q3 and Q4 must never share a writable database.

Examples: `core_2026.db`, `registry_2026.db`, `liveness-2026-q3.db`, `pages-2026-q3.db`, `lighthouse-2026-q3.db`, `axe-2026-q3.db`.

When updating `brief.md` for a new year, also update any downstream `brief.md` files that reference the path.

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
