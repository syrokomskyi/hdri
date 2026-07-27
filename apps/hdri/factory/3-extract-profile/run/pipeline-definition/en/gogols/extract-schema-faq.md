---
factory: extract-schema-faq
title: Extract Schema.org FAQPage
purpose: >-
  Detect Schema.org FAQPage markup in crawled pages.
details: >-
  Parses all JSON-LD blocks, matches @type = "FAQPage". Writes one row per
  content_sha256 to ext_schema_faq. Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_schema_faq rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
