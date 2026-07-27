---
title: Phase 3 · Summarize
purpose: >-
  Compute a SHA-256 fingerprint of pages_YYYY.db and write the provenance
  snapshot that downstream pipelines use to verify data integrity.
entryCriteria:
  - Phase 2 (extract) complete; all ext_* tables populated for the batch.
successSignals:
  - profile-snapshot.json written with SHA-256 and all key metrics.
exitCriteria:
  - profile-snapshot.json exists and contains a non-empty sha256 field.
members:
  - summarize-profile
  - sign-source
---
