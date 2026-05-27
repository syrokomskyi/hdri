---
factory: extract-memberships
title: Extract Memberships
purpose: >-
  Detect membership in professional organisations on crawled pages.
details: >-
  Scans body text for membership keywords: mitglied, mitgliedschaft, membership,
  verband, handwerkskammer, hwk, ihk, innung, bund, vereinigung, fachverband,
  berufsverband, gilde, kammer, bundesverband, landesverband, zentralverband.
  Writes one row per content_sha256 to ext_memberships.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_memberships rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
