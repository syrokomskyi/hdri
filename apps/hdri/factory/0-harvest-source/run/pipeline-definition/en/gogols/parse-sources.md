---
factory: parse-sources
title: Parse Sources
purpose: >-
  Parse all CSV and HTML source files in .input/batches/ (catalogs, databases, etc.),
  normalise domains, filter stop-domains, and register unique sites with their
  source seeds in core.db.
details: >-
  For each batch directory: lists CSV/HTML files, parses them with the appropriate
  parser, normalises each website URL to a canonical domain via normaliseDomain(),
  rejects stop-domains (directory portals, social networks) via isStopDomain(),
  upserts the site into the sites table, and writes a seed row to site_source_seeds.
  All writes are idempotent via ON CONFLICT DO NOTHING / DO UPDATE.
inputs:
  - Batch directories under .input/batches/.
  - brief.maxCountSitePerSourcePage (limits sites per source file).
  - brief.exclude (regex patterns to skip source file paths).
outputs:
  - report.md — overall run summary.
  - report.json — machine-readable summary.
  - batches/<name>/sources.csv — per-file parse stats.
  - batches/<name>/sites-registered.csv — registered sites.
  - batches/<name>/seeds-skipped.csv — skipped items with reason.
definitionOfDone:
  - report.json exists in the gogol output directory.
---
