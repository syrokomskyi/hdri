---
factory: extract-social-twitter
title: Extract Social Twitter / X Link
purpose: >-
  Detect Twitter / X profile links on crawled pages.
details: >-
  Scans all <a href> elements for outbound links whose hostname matches
  twitter.com or x.com. No HTTP requests are made.
  Writes one row per content_sha256 to ext_social_twitter.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_social_twitter rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
