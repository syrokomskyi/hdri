# @syrokomskyi/hdri-codebook

Engine and scoring rule definitions for the HDRI (Handwerk Digital Readiness Index).

## Usage

Contains YAML rule parser ("codebook") and deterministic score calculation logic based on input signals.

## Module structure

- **`parse.ts`** — Zod schema validation and codebook parsing. Exports Zod-derived input types (`Codebook`, `Indicator`, `ScoringRule`, `MissingPolicy`, etc.) as the single source of truth.
- **`types.ts`** — Runtime input types (`SignalValue`, `SiteSignals`, `SiteSignalStatuses`) and scoring output types (`SiteScore`, `DimensionScore`, `IndicatorTrace`).
- **`score-site.ts`** — Core scoring engine: rule appliers (`applyRule`, `isMissing`) and `scoreSite` function.
- **`scoring-rules.ts`** — Re-export shim for `score-site.ts` (backward compatibility).
- **`aggregate.ts`** — Cohort aggregation and statistical summaries.
- **`governance.ts`** — Signatory validation for MAJOR codebook releases (`validateSignatories`, `isMajorBump`, `parseGovernance`).
- **`version.ts`** — Semantic versioning helpers.

## Changelog

[CHANGELOG.md](CHANGELOG.md)
