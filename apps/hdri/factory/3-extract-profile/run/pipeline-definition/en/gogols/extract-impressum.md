---
factory: extract-impressum
title: Extract Impressum
purpose: >-
  Detect impressum (legal notice) links on crawled pages and store results in ext_impressum.
details: >-
  Iterates over page_observations for the current batch. For each unique
  content_sha256, reads the HTML file from CAS, calls extractImpressum()
  (keyword-based link detection — IMPRESSUM_KEYWORDS list), and upserts one
  row into ext_impressum. Idempotent: skips content_sha256 already present
  for the current extractor_ver. Joins site_pages via ATTACH to resolve
  relative hrefs using the canonical page URL as baseUrl.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
  - registry.db (ATTACH, read-only) — provides url_norm for baseUrl resolution.
outputs:
  - ext_impressum rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
