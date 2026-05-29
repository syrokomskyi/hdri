# @org/digital-observatory

> [Deutsche Version](README.md)

Asset-centric longitudinal observatory for digital presence analysis.

## Architecture

Four-layer data model:

1. **Evidence** — raw HTML, Lighthouse JSON, axe JSON (content-addressed)
2. **Observations** — immutable atomic signals with ontology paths and bitemporality
3. **Interpretations** — versioned HDRI scores, cohorts, narrative anchors
4. **Narrative & Visualization** — marts, reports, anomaly alerts

## Pipeline phases

| Phase | Purpose |
|---|---|
| `harvest` | Load asset states, ingest source data |
| `observe` | Map raw signals to ontology-backed observations |
| `interpret` | Score with HDRI codebook, build cohorts |
| `publish` | Build privacy-safe marts, export reports |

## Usage

### Prerequisites

The Digital Observatory pipeline depends on upstream data from the `hdri-factory` pipeline. Before running this pipeline, ensure:

1. **hdri-factory pipelines have completed successfully**:
   - `0-harvest-source` — generates `core.db` with sites catalog
   - `3-extract-profile` — generates `pages_YYYY.db` with ext_* signal tables
   - `4-audit-lighthouse` — generates `lighthouse_YYYY.db` with Lighthouse metrics
   - `5-audit-axe` — generates `axe_YYYY.db` with Axe metrics

2. **Shared packages are built**:
   ```bash
   pnpm turbo run build --filter=@org/pipeline-core --filter=@org/pipeline-node --filter=@org/pipeline-steps --filter=@org/observatory-core --filter=@org/hdri-codebook
   ```

**Note:** The Digital Observatory performs its own HDRI scoring in the `interpret` phase using the codebook from `.input/codebook.yaml`. It does not use pre-computed scores from `hdri-factory/a-score-hdri`.

### Quick Start

1. **Prepare input files** in `apps/digital-observatory/.input/`:
   - `brief.md` — pipeline configuration (see Configuration section below)
   - `codebook.yaml` — HDRI scoring codebook (copy from spec or create custom)

2. **Run the pipeline**:
   ```bash
   # From monorepo root
   pnpm --filter @org/digital-observatory start
   ```

3. **Check output** in `apps/digital-observatory/.output/`:
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
sourceDbDir: "../hdri-factory/0-harvest-source/.output"
publicMode: false
skipGogols: []
---
```

**Configuration fields:**
- `outputLanguage` — Language for generated reports (e.g., `de`, `en`)
- `period` — Analysis period identifier (e.g., `2025-Q2`)
- `ontologyVersion` — Version of signal ontology to use (must match `signal-ontology-v{X}.json` in observatory-core)
- `codebookVersion` — Version of HDRI codebook (must match `codebook-{version}.yaml` in .input/)
- `sourceDbDir` — Path to hdri-factory output directory containing `core.db` (relative to .input/)
- `publicMode` — If true, applies stricter privacy controls for public publication
- `skipGogols` — Array of gogol IDs to skip during execution (e.g., `["export-mart"]`)

### Data Coverage and Liveness Filtering

The Digital Observatory only receives observations for sites that were **live** (HTTP-responsive) at crawl time. The filtering happens upstream:

1. **`0-harvest-source`** ingests all sites from source catalogs
2. **`1-register-businesses`** deduplicates domains
3. **`2-check-liveness`** checks HTTP availability; marks `is_live=false` for dead sites
4. **`3-extract-profile`** only crawls `is_live=true` sites; dead sites never enter `pages_*.db`
5. **`a-contract-ontology`** reads only from `pages_*.db` — dead sites are invisible

**Consequence**: The observatory has no explicit knowledge of dead or unreachable sites. A site present in the original harvest but failing liveness checks will simply be absent from all observations. There is currently no `availability.is_live` signal in the ontology.

### Input Data Sources

The pipeline reads from three upstream databases (read-only, no modification):

1. **core.db** (from `sourceDbDir`):
   - `sites` table — site catalog with gewerk_group, bundesland
   - Used to generate asset states and track site metadata

2. **pages_YYYY.db** (from `sourceDbDir/../3-extract-profile/.output/`):
   - `page_observations` table — crawl log with content_sha256
   - `ext_*` tables (42 tables) — signal extractions (phone, email, schema.org, etc.)
   - Used to map raw signals to ontology-backed observations

3. **audits_YYYY.db** (from `sourceDbDir/../4-audit-lighthouse/.output/` or `sourceDbDir/../5-audit-axe/.output/`):
   - `lighthouse_runs` table — Lighthouse performance metrics
   - `axe_runs` table — axe accessibility violation counts
   - Used to score technical performance and accessibility

### Output

**Database:** `apps/digital-observatory/.output/observatory.db`
- `pipeline_runs` — execution log with timestamps and metadata
- `asset_states` — SCD-2 tracking of site asset states over time
- `observations` — ontology-backed observations with bitemporality

**Artifacts:** `apps/digital-observatory/.output/step-{gogol-id}/`
- Per-gogol JSON reports, cohort definitions, mart exports

### Regenerating the HDRI Dashboard after codebook changes

The `hdri-dashboard` Astro app consumes aggregated JSON data exported from the observatory database. Changing `codebook.yaml` does **not** automatically update the dashboard — you must re-run the scoring phase and the export step.

**Step-by-step:**

1. **Re-run the Digital Observatory pipeline** so that `ScoreHdriGogol` re-reads `.input/codebook.yaml` and writes updated scores to `observatory.db`:
   ```bash
   pnpm --filter @org/digital-observatory start
   ```

2. **Export the dashboard archive** from the updated database:
   ```bash
   pnpm --filter @org/digital-observatory run export:dashboard
   ```
   This writes public JSON payloads into `apps/hdri-dashboard/src/assets/data/`.

3. **Build the Astro dashboard**:
   ```bash
   pnpm --filter @org/hdri-dashboard run build
   ```

**Why this is required:** the dashboard only reads *published* (`status = 'published'`) runs from `observatory.db`. The codebook is loaded at scoring time (`interpret` phase), so any weight or rule change must flow through: `codebook.yaml` → `ScoreHdriGogol` → `observatory.db` → `export-hdri-dashboard-archive.ts` → `hdri-dashboard/dist/`.

## Publication

Aggregated, anonymised quarterly data are published on **[handwerk-index.de](https://handwerk-index.de)**. The complete methodology is in [`METHODOLOGY.en.md`](../../METHODOLOGY.en.md).

## Dependencies

- `@org/observatory-core` — types, ontology, validation, hashing
- `@org/hdri-codebook` — HDRI (Handwerk Digital Readiness Index) scoring engine
- `@org/pipeline-core`, `@org/pipeline-node`, `@org/pipeline-steps` — shared pipeline engine
