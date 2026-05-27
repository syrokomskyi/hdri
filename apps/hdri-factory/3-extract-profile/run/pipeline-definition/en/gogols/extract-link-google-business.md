---
factory: extract-link-google-business
title: Extract Link to Google Business Profile
purpose: >-
  Detect links to Google Business profiles on crawled pages.
details: >-
  Scans all <a href> elements for links to business.google.com, g.page,
  maps.app.goo.gl, goo.gl, and maps.google.com URLs containing cid= or
  /maps/place/ path fragments. No HTTP requests are made.
  Writes one row per content_sha256 to ext_link_google_business.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_link_google_business rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
