# HDRI Factory Pipeline — Local Guide

This file provides AI agent guidance specific to the `apps/hdri-factory` pipeline chain. Apply these rules in addition to the general `apps/AGENTS.md` guidelines.

## Locality invariant (hard rule)

Every app under `apps/hdri-factory/<N>-<name>/` **writes only to its own `.output/`**. Reading from a sibling app's `.output/` is allowed in read-only mode via an explicit path declared in `brief.md`. Writes into another app's folder are bugs — fix them immediately.

## Database naming rule (hard rule)

Every SQLite database produced by a factory app **must include a `_YYYY` suffix** where `YYYY` is the pipeline run year declared in `brief.md` (e.g., `harvestYear`, `scanYear`, `auditYear`). This bounds long-term growth and makes the year scope explicit. Year-rollover migration is out of scope until explicitly requested.

Examples: `core_2026.db`, `liveness_2026.db`, `pages_2026_h1.db`, `lighthouse_2026.db`, `axe_2026.db`.

When updating `brief.md` for a new year, also update any downstream `brief.md` files that reference the path.

## Pipeline structure

The hdri-factory pipeline is a chain of **workspace applications**, not a single monolithic app. Each is a **crawl factory** component — it collects raw signals and emits them for downstream consumption by `apps/digital-observatory`.

- **0-harvest-source**: Ingests source files (CSV/HTML/MHTML), parses business data, enriches bundesland, classifies gewerk_group. Outputs `core_YYYY.db`.
- **1-register-businesses**: Collects distinct domains from harvested core.db, deduplicates into a device-local registry, mints deterministic da-* asset IDs. Outputs `registry_YYYY.db`.
- **2-check-liveness**: Checks site reachability via HTTP. Outputs `liveness_YYYY.db`.
- **3-extract-profile**: Crawls sites, extracts 42 signal types into `ext_*` flat tables. Outputs `pages_YYYY.db`.
- **4-audit-lighthouse**: Runs Lighthouse performance audits. Outputs `lighthouse_YYYY.db`.
- **5-audit-axe**: Runs Axe accessibility audits. Outputs `axe_YYYY.db`.

**Note:** HDRI scoring and publication live in `apps/digital-observatory`, not here.

Each app has its own `run/` directory, brief.md, and gogol registry. Run workspace commands from the monorepo root with `pnpm turbo ...`.

## Database contracts

### core.db (0-harvest-source)
- `sites(id, domain, gewerk_group, bundesland, gemeinde)` — master site catalog
- `site_pages(id, site_id, url_norm, url_sha256)` — URL registry
- `site_source_seeds(id, site_id, batch_id, source_path, ...)` — provenance
- `site_cohorts(id, description, ...)` — cohort definitions
- `site_strata(cohort_id, site_id, gewerk_group, bundesland, ...)` — cohort membership

### pages_YYYY.db (3-extract-profile)
- `page_observations(batch_id, site_page_id, content_sha256, observed_at, ...)` — crawl log
- `page_contents(sha256, storage_path, byte_size)` — CAS for HTML
- `ext_*` tables (42 flat tables) — one per signal type, schema: `(content_sha256, present, extractor_ver, ...)`

### axe_YYYY.db (5-audit-axe) and lighthouse_YYYY.db (4-audit-lighthouse)
- `audit_runs(audit_batch_id, site_id, tool, ok, ...)` — audit log
- `lighthouse_runs(audit_batch_id, site_id, ...)` — Lighthouse metrics
- `axe_runs(audit_batch_id, site_id, ...)` — axe violation counts

## ext_* flat table schema

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

- Default mode is `enforce` (fail if any stratum has < k_min=5 sites)
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

## Anti-patterns

- Do not read from legacy `content_extractions` or `content_contacts` tables — use `ext_*` tables.
- Do not hardcode cohort IDs — resolve from `site_cohorts` or accept via brief.
- Do not skip k-anonymity enforcement in production — default to `enforce` mode.
- Do not publish identifying data in public mode — use `publicationMode` guard.
- Do not apply `maxSites` quota before stratification — allocate proportionally after shuffling.
