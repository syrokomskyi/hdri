---
factory: extract-map
title: Extract Embedded Map
purpose: >-
  Detect embedded maps (Google Maps, OpenStreetMap, Apple Maps) on crawled pages.
details: >-
  Primary: checks for <iframe src> matching maps.google.com, openstreetmap.org,
  maps.apple.com (confidence 95). Fallback: checks for [id*=map], [class*=map],
  [id*=karte] container elements (confidence 65). Writes one row per
  content_sha256 to ext_map. Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_map rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
