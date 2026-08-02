---
factory: extract-social-facebook
title: Extract Social Facebook Link
purpose: >-
  Detect Facebook / fb.com profile links on crawled pages.
details: >-
  Scans all <a href> elements for outbound links whose hostname matches
  facebook.com, fb.com, or fb.me. No HTTP requests are made.
  Writes one row per content_sha256 to ext_social_facebook.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_social_facebook rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
