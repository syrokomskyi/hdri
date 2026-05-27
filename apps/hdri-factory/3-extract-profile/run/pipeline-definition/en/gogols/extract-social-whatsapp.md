---
factory: extract-social-whatsapp
title: Extract Social WhatsApp Link
purpose: >-
  Detect WhatsApp contact links on crawled pages.
details: >-
  Scans all <a href> elements for outbound links whose hostname matches
  whatsapp.com, wa.me, or api.whatsapp.com. No HTTP requests are made.
  Writes one row per content_sha256 to ext_social_whatsapp.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_social_whatsapp rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
