---
factory: extract-certifications
title: Extract Certifications
purpose: >-
  Detect certification mentions on crawled pages.
details: >-
  Scans body text and image alt attributes for certification keywords:
  zertifikat, zertifiziert, certification, certified, din, iso, tüv, tuev,
  dekra, geprüft, qualitätszertifikat. Writes one row per content_sha256 to
  ext_certifications. Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_certifications rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
