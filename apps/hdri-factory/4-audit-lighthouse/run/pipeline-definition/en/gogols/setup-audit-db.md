---
factory: setup-audit-db
title: Setup Audit DB
purpose: >-
  Idempotently create and migrate audits_YYYY.db, stamping _schema_meta.
details: >-
  Creates the DB output directory if needed, opens audits_YYYY.db
  (year taken from brief.auditYear), runs migrateAudits() to create audit_runs,
  lighthouse_runs, axe_runs tables with all indexes, then stamps _schema_meta
  with owner_app=site-deep-audit and schema_version=v1.0. Safe to re-run — all
  DDL uses CREATE TABLE IF NOT EXISTS.
inputs:
  - DB directory path derived from output root.
  - brief.auditYear.
outputs:
  - db-setup.json confirming DB path, schema version, and table list.
  - db-summary.md human-readable setup summary.
definitionOfDone:
  - db-setup.json exists in the gogol output directory.
---

