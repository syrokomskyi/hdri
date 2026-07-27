---
factory: extract-phone
title: Extract Phone Numbers
purpose: >-
  Detects and counts phone numbers on crawled pages using regex pattern matching
  and writes the results to ext_phone.
details: >-
  Iterates over page_observations for the current batch, reads HTML from CAS storage,
  extracts phone numbers using the business-crawler extractPageSignals function,
  and upserts one row per content_sha256 into ext_phone with present flag and count.
inputs:
  - pages_YYYY.db (page_observations, page_contents)
  - registry.db (site_pages for url_norm)
outputs:
  - ext_phone table (content_sha256, extractor_ver, present, count)
  - extract-report.json (parsing statistics)
definitionOfDone:
  - ext_phone table contains one row per unique content_sha256.
  - extract-report.json shows total, parsed, skipped, and totalPhones counts.
---
