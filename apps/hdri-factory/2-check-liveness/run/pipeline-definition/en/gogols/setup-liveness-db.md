---
factory: setup-liveness-db
title: Setup Liveness DB
purpose: >-
  Idempotently create and migrate liveness.db, stamping _schema_meta.
details: >-
  Creates the liveness.db output directory if needed, opens the database,
  runs migrateLiveness() to create the liveness_checks table and all indexes,
  then stamps _schema_meta with owner_app=site-liveness and schema_version=v1.0.
  Safe to re-run — all DDL uses CREATE TABLE IF NOT EXISTS.
inputs:
  - DB directory path derived from output root.
outputs:
  - db-setup.json confirming DB path, schema version, and table list.
  - db-summary.md human-readable setup summary.
definitionOfDone:
  - db-setup.json exists in the gogol output directory.
---

