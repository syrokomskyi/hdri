---
factory: extract-schema-review
title: Extract Schema.org Review / AggregateRating
purpose: >-
  Detect Schema.org Review or AggregateRating markup in crawled pages.
details: >-
  Parses all JSON-LD blocks, matches @type = "Review" or "AggregateRating".
  Writes one row per content_sha256 to ext_schema_review.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_schema_review rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
