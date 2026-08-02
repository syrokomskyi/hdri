---
factory: extract-case-studies
title: Extract Case Studies
purpose: >-
  Detect case study links on crawled pages.
details: >-
  Scans <a href> elements for keywords: case-study, case-studies, fallstudie,
  fallstudien, kundenprojekt, referenzprojekt, projektbericht,
  erfolgsgeschichte, success-story. Writes one row per content_sha256 to
  ext_case_studies. Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_case_studies rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
