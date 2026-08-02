---
factory: extract-copyright-year
title: Extract Copyright Year
purpose: >-
  Extract the most recent copyright year from crawled pages and store results in ext_copyright_year.
details: >-
  Iterates over page_observations for the current batch. For each unique
  content_sha256, reads the HTML file from CAS, calls extractCopyrightYear().
  Searches <footer> text first for higher precision, falls back to full body
  text. Matches © / (c) / copyright patterns in any language including year
  ranges (e.g. © 2019–2026 → takes upper bound 2026). Valid range: 1990–
  current+1. Upserts one row into ext_copyright_year. Idempotent: skips
  content_sha256 already present for the current extractor_ver.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_copyright_year rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
