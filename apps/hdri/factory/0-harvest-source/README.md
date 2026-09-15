# @syrokomskyi/catalog-harvest

Pipeline for loading primary site lists from external catalogs (T0 — Ingestion).

## How It Handles Sites from Multiple Sources

When the same website appears in multiple catalog sources, the pipeline:

- **Deduplicates automatically**: Each website domain is stored only once, regardless of how many times it appears across different source files or batches.
- **Preserves source information**: All original business data from each source (company name, address, category, etc.) is kept and linked to the single domain record.
- **Aggregates categories for classification**: If different sources list different industry categories for the same site, all unique categories are collected and used together to determine the best industry classification.
- **Tracks discovery history**: The pipeline records when a site was first seen and when it was last seen, allowing you to track site recurrence across harvests.

**Result**: You get one clean domain record per website, with all available business data from all sources preserved and a unified industry classification.

## Data sources

Catalog files placed in `.input/batches/` are typically sourced from public registers and industry directories, for example:

- **Handwerkskammer member directories** — public listings of chamber-member businesses
- **IHK company registers** — publicly searchable business entries
- **Trade-fair exhibitor lists** — publicly published participant catalogs
- **Industry association websites** — member or service-provider listings
- **Manual research** — direct collection from Google Maps, local business listings, or chamber websites

The pipeline does not connect to these systems live; it ingests static files (CSV/HTML/MHTML) that you prepare offline.

## Getting Started

1. Prepare `.input/brief.md` with `sourceToken` (format: `YYYY-Qn-CC[-extra]`).
2. Place catalog files (CSV/HTML) in `.input/batches/<batch-name>/`.
3. Run from the monorepo root:
   ```bash
   pnpm turbo run start --filter=@syrokomskyi/catalog-harvest
   ```
4. Monitor execution in `.output/_guide/`.

## Source batch admission (RFC-0102)

Source admission remains blocked pending the real evidence verifier and Q2 preservation/isolation qualification. Local parser success is not permission to collect or publish:

- **Per-file receipts**: Each parsed file stores `content_sha256`, `parser_id`, `parser_version`, and `dependency_fingerprint` in `source_file_stats`. Resume logic skips a file only if all four fields match.
- **Parser routing**: Nested external-host boundaries route to `UnknownSourceParser` instead of inheriting the parent's parser.
- **Per-source yield gate**: `checkPerSourceYield` blocks sealing if a source folder produces zero accepted seeds unless declared as `"declared-noise"` in `brief.md` frontmatter `sourceDisposition` map.
- **Offline audit**: the estimator uses the same parser routing, strict decoding, supported extensions and website acceptance as harvest. It never opens a database. See the command below.

## Offline source audit

From the repository root, choose an existing input batch and a **fresh**, disjoint report directory whose parent already exists:

```bash
pnpm estimate:hdri \
  --batch-root apps/hdri/factory/.input/batches/2026-q3-de-01 \
  --report-dir apps/hdri/factory/0-harvest-source/.output/q3-source-audit-new
```

`files.ndjson` accounts for every regular file, including unsupported extensions and unknown external hosts. Each parsed occurrence retains its role, entity key, normalized-domain decision and SHA-256 of the complete extracted seed. `summary.json` reconciles occurrences, exclusion reasons, accepted occurrences, unique domains and duplicates; it binds the NDJSON bytes and the twice-checked input closure. `newDomains` and `baseline` are null: novelty relative to Q2 is unknown.

Exit 1 with a summary means the diagnostic completed but found errors, unrecognized pages or unsupported extensions. An interrupted or unstable-input run has no completion summary; retain it as incomplete and use a new output directory. Inputs must have no concurrent writers, with stable ancestor directories. File reads and DOM parsing are bounded to 8 MiB; malformed encoding is an error rather than silently replaced text.

`StadtbranchenbuchMirrorParser` is the sole parser for the catalog family. It recognizes primary, listing, mixed and navigation pages by evidence, not by city-host routing or company IDs inferred from filenames. Primary and listing occurrences have distinct keys and roles. Foreign nested hosts and conflicting identities are not accepted through fallback.

The shared standardized CSV parser retains rows without websites so they enter `no_url` accounting. Such rows are not accepted website candidates; empty CSVs remain empty. Other catalog-specific HTML parsers require their own coverage qualification before adding their inputs to a frozen frame.

This report is diagnostic only (`operationallyQualified: false`), not a signed admission receipt or reusable source-frame artifact. Full implementation/dependency lineage, current-batch completeness admission, historical identity reconciliation, independent extraction accuracy checks and operational qualification are still required. Retained Q2 databases must not be used as writable test fixtures.

## Changelog

[CHANGELOG.md](CHANGELOG.md)
