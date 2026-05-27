---
title: Phase 0 · Setup
purpose: >-
  Capture the execution environment profile for transparency, then idempotently
  initialise lighthouse_YYYY.db with audit infrastructure.
entryCriteria:
  - The output root directory is writable.
successSignals:
  - environment-profile.json captures hardware, OS, and tool versions.
  - lighthouse_YYYY.db is created with audit_runs, lighthouse_runs tables and _schema_meta stamped.
exitCriteria:
  - environment-profile.json exists in the capture-environment-profile output directory.
  - db-setup.json exists in the setup-audit-db output directory.
members:
  - capture-environment-profile
  - setup-audit-db
---

