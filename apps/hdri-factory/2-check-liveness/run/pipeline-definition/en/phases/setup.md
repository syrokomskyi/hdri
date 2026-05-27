---
title: Phase 0 · Database Setup
purpose: >-
  Idempotently initialise liveness.db before any HTTP checks begin.
entryCriteria:
  - The output root directory is writable.
successSignals:
  - liveness.db is created with the correct schema and _schema_meta stamped.
exitCriteria:
  - db-setup.json exists in the setup-liveness-db output directory.
members:
  - setup-liveness-db
---

