---
factory: extract-agb-page
title: Extract AGB Page
purpose: >-
  Detect AGB (Allgemeine Geschäftsbedingungen / terms and conditions) links on crawled pages.
details: >-
  Scans all <a href> elements for keywords: agb, allgemeine-geschaftsbedingungen,
  nutzungsbedingungen, terms-of-service, etc. Uses url_norm from registry.db as
  baseUrl for relative href resolution. Writes one row per content_sha256 to
  ext_agb_page with url and confidence. Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
  - registry.db (ATTACH, read-only) — provides url_norm for baseUrl resolution.
outputs:
  - ext_agb_page rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
