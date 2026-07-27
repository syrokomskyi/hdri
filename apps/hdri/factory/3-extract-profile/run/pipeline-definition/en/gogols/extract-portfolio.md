---
factory: extract-portfolio
title: Extract Portfolio / Gallery
purpose: >-
  Detect portfolio or gallery sections on crawled pages.
details: >-
  Scans <a href> elements for keywords: portfolio, galerie, gallery, referenzen,
  projekte, arbeiten, bildergalerie, fotogalerie, unsere-projekte. Falls back to
  body text scan for lower-confidence match. Writes one row per content_sha256
  to ext_portfolio. Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_portfolio rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
