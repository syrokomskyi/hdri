---
factory: setup-audit-db
title: Setup Audit DB
purpose: >-
  Idempotently create and migrate audits_YYYY.db, stamping _schema_meta.
details: >-
  Creates the DB output directory if needed, opens audits_YYYY.db
  (year derived from brief.sourceToken via parseSourceToken), runs migrateAxe()
  to create audit_runs and axe_runs tables with all indexes, then stamps
  _schema_meta with owner_app=5-audit-axe and schema_version=v1.0. Safe to
  re-run — all DDL uses CREATE TABLE IF NOT EXISTS.
inputs:
  - DB directory path derived from output root.
  - brief.sourceToken (year extracted at runtime).
outputs:
  - db-setup.json confirming DB path, schema version, and table list.
  - db-summary.md human-readable setup summary.
definitionOfDone:
  - db-setup.json exists in the gogol output directory.
---

