---
factory: extract-awards
title: Extract Awards
purpose: >-
  Detect award or prize mentions on crawled pages.
details: >-
  Scans body text and image alt attributes for award keywords: auszeichnung,
  award, preis, gewinner, winner, ehrung, preisträger, preistraeger, sieger,
  ausgezeichnet. Writes one row per content_sha256 to ext_awards.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_awards rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
