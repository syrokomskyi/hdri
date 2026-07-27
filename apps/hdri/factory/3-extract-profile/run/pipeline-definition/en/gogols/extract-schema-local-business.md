---
factory: extract-schema-local-business
title: Extract Schema.org LocalBusiness
purpose: >-
  Detect Schema.org LocalBusiness markup (and its subtypes) in crawled pages.
details: >-
  Parses all JSON-LD blocks and collects @type values. Matches against
  LocalBusiness and major subtypes (Store, Restaurant, HealthAndBeautyBusiness,
  AutomativeBusiness, etc.). Writes one row per content_sha256 to
  ext_schema_local_business. Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_schema_local_business rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
