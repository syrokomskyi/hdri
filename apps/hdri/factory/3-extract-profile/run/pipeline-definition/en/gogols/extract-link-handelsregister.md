---
factory: extract-link-handelsregister
title: Extract Link to Handelsregister
purpose: >-
  Detect links to handelsregister.de on crawled pages.
details: >-
  Scans all <a href> elements for outbound links whose hostname matches
  handelsregister.de. No HTTP requests are made; link presence in HTML is
  sufficient. Writes one row per content_sha256 to ext_link_handelsregister.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_link_handelsregister rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
