---
factory: extract-schema-opening-hours-spec
title: Extract Schema.org OpeningHoursSpecification
purpose: >-
  Detect Schema.org OpeningHoursSpecification markup in crawled pages.
details: >-
  Parses all JSON-LD blocks, matches @type = "OpeningHoursSpecification". Unlike
  ExtractOpeningHoursGogol which extracts text content, this gogol only records
  the presence of the structured markup type. Writes one row per content_sha256
  to ext_schema_opening_hours_spec. Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_schema_opening_hours_spec rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
