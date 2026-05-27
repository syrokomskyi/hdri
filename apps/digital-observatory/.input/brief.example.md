---
outputLanguage: de
period: "2026-Q2"
ontologyVersion: "1.0.0"
codebookVersion: "hdri-v1.0.0"
sourceDbDir: "../hdri-factory/0-harvest-source/.output"
publicMode: false
skipGogols: []
---

# Digital Observatory Brief

This brief configures the asset-centric longitudinal observatory.

## What This Does

- Ingests upstream data from hdri-factory pipelines
- Creates asset states with SCD-2 versioning
- Maps raw signals to ontology-backed observations
- Scores with HDRI codebook
- Builds privacy-safe marts

## Required Input

1. **hdri-factory pipelines must be complete**:
   - `0-harvest-source/.output/core.db`
   - `3-extract-profile/.output/pages_YYYY.db`
   - `4-audit-lighthouse/.output/audits_YYYY.db`
   - `5-audit-axe/.output/audits_YYYY.db`

2. **codebook.yaml** in `.input/` (HDRI scoring rules)

## Configuration

| Field | Description | Example |
|-------|-------------|---------|
| `outputLanguage` | Report language | `de`, `en` |
| `period` | Analysis period | `"2026-Q2"` |
| `ontologyVersion` | Signal ontology version | `"1.0.0"` |
| `codebookVersion` | HDRI codebook version | `"hdri-v1.0.0"` |
| `sourceDbDir` | Path to hdri-factory output | `"../hdri-factory/0-harvest-source/.output"` |
| `publicMode` | Stricter privacy for public data | `false` |
| `skipGogols` | Gogols to skip | `["export-mart"]` |

## Output

- `observatory.db` — pipeline_runs, asset_states, observations, scores
- `.output/step-*/` — per-gogol artifacts and reports
