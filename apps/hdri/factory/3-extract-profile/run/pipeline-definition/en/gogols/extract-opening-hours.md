---
factory: extract-opening-hours
title: Extract Opening Hours
purpose: >-
  Extract opening hours from crawled pages and store results in ext_opening_hours.
details: >-
  Iterates over page_observations for the current batch. For each unique
  content_sha256, reads the HTML file from CAS, calls extractOpeningHours().
  Strategy: tries JSON-LD structured data first (openingHours /
  openingHoursSpecification — source='jsonld', confidence=90); falls back to
  plain-text heuristics near known headings (Öffnungszeiten / opening hours —
  source='text', confidence=50). Upserts one row into ext_opening_hours.
  Idempotent: skips content_sha256 already present for the current extractor_ver.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_opening_hours rows in pages_YYYY.db (text, source, confidence).
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
