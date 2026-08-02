---
factory: extract-meister
title: Extract Meister / Handwerksmeister
purpose: >-
  Detect Meisterbetrieb or Handwerksmeister mentions on crawled pages.
details: >-
  Scans body text and image alt attributes for keywords: meisterbetrieb,
  handwerksmeister, meisterbrief, meisterin, meister, hwk-meister,
  staatlich geprüft. Writes one row per content_sha256 to ext_meister.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_meister rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
