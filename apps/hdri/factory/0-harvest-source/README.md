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
- **Per-source yield gate**: `checkPerSourceYield` runs before each batch is sealed and requires accepted seeds for that exact batch and source folder, unless declared as `"declared-noise"` in `brief.md` frontmatter `sourceDisposition` map. Another batch's records cannot satisfy it; an already known domain with provenance in this batch can. This read-only check does not establish per-file/digest completeness or verified historical inheritance.
- **Offline audit**: business extraction uses the same parser routing, strict decoding, supported extensions and website acceptance as harvest. The audit additionally inspects every retained file, including technical metadata and unsupported extensions. Production completeness does not yet consume this full inventory. It never opens a database. See the command below.

## Offline source audit

From the repository root, choose an existing input batch and a **fresh**, disjoint report directory whose parent already exists:

```bash
pnpm estimate:hdri \
  --batch-root apps/hdri/factory/.input/batches/2026-q3-de-01 \
  --report-dir apps/hdri/factory/0-harvest-source/.output/q3-source-audit-new
```

`files.ndjson` accounts for every regular file, including unsupported extensions and unknown external hosts. Each parsed occurrence retains its role, entity key, normalized-domain decision and SHA-256 of the complete extracted seed. `summary.json` reconciles occurrences, exclusion reasons, accepted occurrences, unique domains and duplicates; it binds the NDJSON bytes and the twice-checked input closure. `newDomains` and `baseline` are null: novelty relative to Q2 is unknown.

Per-file `inspection` records payload kind, compression, decoded byte count/hash and narrowly recognized mirror timestamp hints. `documentKinds` summarizes those classifications. Recognized robots policies and mirror metadata contribute explicit no-seed outcomes; they do not authorize live requests. Empty captures, unexpected robots responses and sensitive cookie jars remain review-required. Cookie values are not emitted. External HTML is never promoted into catalog company evidence merely because it contains links.

`mirrorDateHints` counts files containing each recognized date label. These labels are untrusted retained text, not verified acquisition dates or measurement timestamps. The actual Q3 input includes April 2026 mirror hints; naming the batch Q3 does not make it Q3 observations. Using a historical catalog as a Q3 candidate source requires an explicit source-age/selection policy and independent Q3 measurements.

Exit 1 with a summary means the diagnostic completed but found errors, unrecognized pages or unsupported extensions. An interrupted or unstable-input run has no completion summary; retain it as incomplete and use a new output directory. Inputs must have no concurrent writers, with stable ancestor directories. Raw files and decoded gzip payloads are bounded to 8 MiB; invalid gzip, nested compression and malformed encoding are errors rather than silently replaced text.

`StadtbranchenbuchMirrorParser` is the sole parser for the catalog family. It recognizes primary, listing, mixed and navigation pages by evidence, not by city-host routing or company IDs inferred from filenames. Primary and listing occurrences have distinct keys and roles. Foreign nested hosts and conflicting identities are not accepted through fallback.

The shared standardized CSV parser retains rows without websites so they enter `no_url` accounting. Such rows are not accepted website candidates; blank captures, including CSV, are rejected by the shared harvest entry as unrecognized, not successful empty sources. Other catalog-specific HTML parsers require their own coverage qualification before adding their inputs to a frozen frame.

This report is diagnostic only (`operationallyQualified: false`), not a signed admission receipt or reusable source-frame artifact. Full implementation/dependency lineage, current-batch completeness admission, historical identity reconciliation, independent extraction accuracy checks and operational qualification are still required. Retained Q2 databases must not be used as writable test fixtures.

The [Q3 payload review](../../../../docs/reviews/code/apps-hdri-factory-0-harvest-source/review-2026-09-15-15-45-apps-hdri-factory-0-harvest-source.md) records the final actual-input inventory, unchanged extraction proof, remaining quarantine and sequential launch work.

## Changelog

[CHANGELOG.md](CHANGELOG.md)
