# @syrokomskyi/observatory

> [Deutsche Version](README.md)

Asset-centric longitudinal observatory for digital presence analysis.

## Architecture

Four-layer data model:

1. **Evidence** — raw HTML, Lighthouse JSON, axe JSON (content-addressed)
2. **Observations** — immutable atomic signals with ontology paths and bitemporality
3. **Interpretations** — versioned HDRI scores, cohorts, narrative anchors
4. **Narrative & Visualization** — marts, reports, anomaly alerts

## Pipeline phases

| Phase       | Purpose                                         |
| ----------- | ----------------------------------------------- |
| `harvest`   | Load asset states, ingest source data           |
| `observe`   | Map raw signals to ontology-backed observations |
| `interpret` | Score with HDRI codebook, build cohorts         |
| `publish`   | Build privacy-safe marts, export reports        |

## Usage

### Prerequisites

The Digital Observatory pipeline depends on upstream data from the `factory` pipeline. Before running this pipeline, ensure:

1. **factory pipelines have completed successfully**:
   - `0-harvest-source` — generates `core.db` with sites catalog
   - `3-extract-profile` — generates `pages-YYYY-qN.db` with ext\_\* signal tables
   - `4-audit-lighthouse` — optionally generates `lighthouse-YYYY-qN.db`
   - `5-audit-axe` — generates `axe-YYYY-qN.db` with Axe metrics

2. **Shared packages are built**:
   ```bash
   pnpm turbo run build --filter=@syrokomskyi/pipeline-core --filter=@syrokomskyi/pipeline-node --filter=@syrokomskyi/pipeline-steps --filter=@syrokomskyi/observatory-core --filter=@syrokomskyi/hdri-codebook
   ```

**Note:** The Digital Observatory performs its own HDRI scoring in the `interpret` phase using the codebook from `.input/codebook.yaml`. It does not use pre-computed scores from `factory/a-score-hdri`.

### Quick Start

1. **Prepare input files** in `apps/hdri/observatory/.input/`:
   - `brief.md` — pipeline configuration (see Configuration section below)
   - `codebook.yaml` — HDRI scoring codebook (copy from spec or create custom)

2. **Run the pipeline**:

   ```bash
   # From monorepo root
   pnpm --filter @syrokomskyi/observatory start
   ```

3. **Check output** in `apps/hdri/observatory/.output/`:
   - `observatory.db` — SQLite database with asset states, observations, scores
   - Artifacts per gogol in `.output/step-*/`

### Configuration

Create `.input/brief.md`:

```yaml
---
outputLanguage: de
period: "2025-Q2"
ontologyVersion: "1.0.0"
codebookVersion: "hdri-v1.0.0"
sourceDbDir: "../factory/0-harvest-source/.output"
publicMode: false
skipGogols: []
---
```

**Configuration fields:**

- `outputLanguage` — Language for generated reports (e.g., `de`, `en`)
- `period` — Analysis period identifier (e.g., `2025-Q2`)
- `ontologyVersion` — Version of signal ontology to use (must match `signal-ontology-v{X}.json` in observatory-core)
- `codebookVersion` — Version of HDRI codebook (must match `codebook-{version}.yaml` in .input/)
- `sourceDbDir` — Path to factory output directory containing `core.db` (relative to .input/)
- `publicMode` — If true, applies stricter privacy controls for public publication
- `skipGogols` — Array of gogol IDs to skip during execution (e.g., `["export-mart"]`)

### Data Coverage and Liveness Filtering

The Digital Observatory only receives observations for sites that were **live** (HTTP-responsive) at crawl time. The filtering happens upstream:

1. **`0-harvest-source`** ingests all sites from source catalogs
2. **`1-register-businesses`** deduplicates domains
3. **`2-check-liveness`** checks HTTP availability; marks `is_live=false` for dead sites
4. **`3-extract-profile`** only crawls `is_live=true` sites; dead sites never enter `pages_*.db`
5. **`a-contract-ontology`** reads only from `pages_*.db` — dead sites are invisible

From ontology 2.0 onward, quarterly `availability.website.*` observations are published. `blocked` and `indeterminate` are not outages. `website_became_unavailable` may only be emitted for a previously reachable website; a never-reachable source candidate remains in the research archive but is never called “dead”. These website events make no claim that a business has closed.

### Input Data Sources

The pipeline reads from three upstream databases (read-only, no modification):

1. **core.db** (from `sourceDbDir`):
   - `sites` table — site catalog with gewerk_group, bundesland
   - Used to generate asset states and track site metadata

2. **pages-YYYY-qN.db** (from the sealed Factory quarter):
   - `page_observations` table — crawl log with content_sha256
   - `ext_*` tables (42 tables) — signal extractions (phone, email, schema.org, etc.)
   - Used to map raw signals to ontology-backed observations

3. **audits_YYYY.db** (from `sourceDbDir/../4-audit-lighthouse/.output/` or `sourceDbDir/../5-audit-axe/.output/`):
   - `lighthouse_runs` table — Lighthouse performance metrics
   - `axe_runs` table — axe accessibility violation counts
   - Used to score technical performance and accessibility

### Output

**Database:** `apps/hdri/observatory/.output/observatory.db`

- `pipeline_runs` — execution log with timestamps and metadata
- `asset_states` — SCD-2 tracking of site asset states over time
- `observations` — ontology-backed observations with bitemporality

**Artifacts:** `apps/hdri/observatory/.output/step-{gogol-id}/`

- Per-gogol JSON reports, cohort definitions, mart exports

### Regenerating the HDRI Dashboard after codebook changes

The `dashboard` Astro app consumes aggregated JSON data exported from the observatory database. Changing `codebook.yaml` does **not** automatically update the dashboard — you must re-run the scoring phase and the export step.

**Step-by-step:**

1. **Re-run the Digital Observatory pipeline** so that `ScoreHdriGogol` re-reads `.input/codebook.yaml` and writes updated scores to `observatory.db`:

   ```bash
   pnpm --filter @syrokomskyi/observatory start
   ```

2. **Export the dashboard archive** from the updated database:

   ```bash
   pnpm --filter @syrokomskyi/observatory run export:dashboard
   ```

   This writes public JSON payloads into `apps/hdri/dashboard/src/assets/data/`.

3. **Build the Astro dashboard**:
   ```bash
   pnpm --filter @syrokomskyi/dashboard run build
   ```

**Why this is required:** the dashboard only reads _published_ (`status = 'published'`) runs from `observatory.db`. The codebook is loaded at scoring time (`interpret` phase), so any weight or rule change must flow through: `codebook.yaml` → `ScoreHdriGogol` → `observatory.db` → `export-dashboard-archive.ts` → `dashboard/dist/`.

## Publication

Aggregated, anonymised quarterly data are published on **[handwerk-index.de](https://handwerk-index.de)**. The complete methodology is in [`METHODOLOGY.en.md`](../../METHODOLOGY.en.md).

### K-Anonymity Policy

The k-anonymity threshold is no longer hardcoded in source — it is loaded from a versioned YAML policy file:

- **File:** `policies/k-anon-policy-v{N}.yaml` (highest version number is auto-selected)
- **Fields:** `default_k`, `hard_floor`, `high_risk_release`
- **Resolution:** `effective_k_min = default_k`, unless `default_k < hard_floor` and `high_risk_release` is `false` — then `hard_floor` applies
- **Current policy:** `default_k: 12`, `hard_floor: 5`, `high_risk_release: false` → `effective_k_min = 12`

All export tools (`export-dashboard-data`, `export-dashboard-archive`, `ExportMartGogol`) load the policy at runtime via `loadKAnonPolicy()` from `tools/k-anon-policy.ts`.

## Dependencies

- `@syrokomskyi/observatory-core` — types, ontology, validation, hashing
- `@syrokomskyi/hdri-codebook` — HDRI (Handwerk Digital Readiness Index) scoring engine
- `@syrokomskyi/pipeline-core`, `@syrokomskyi/pipeline-node`, `@syrokomskyi/pipeline-steps` — shared pipeline engine
