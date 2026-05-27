---
title: Phase 0 · Database Setup
purpose: Idempotently initialise core.db before any data ingestion begins.
entryCriteria:
  - The output root directory is writable.
successSignals:
  - core.db exists and is schema-initialised.
  - _schema_meta is stamped with owner_app and schema_version.
exitCriteria:
  - db-setup.json artifact exists in the gogol output directory.
members:
  - setup-core-db
---

