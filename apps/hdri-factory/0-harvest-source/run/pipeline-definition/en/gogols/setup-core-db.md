---
factory: setup-core-db
title: Setup Core DB
purpose: Idempotently create and migrate core.db, stamping _schema_meta.
details: >-
  Creates the core.db SQLite file in .output/data/db/ and applies all
  CREATE TABLE IF NOT EXISTS migrations from @org/business-core.
  Stamps _schema_meta with owner_app=catalog-harvest and schema_version.
  Safe to run multiple times — CREATE TABLE IF NOT EXISTS is idempotent.
inputs:
  - DB directory path derived from output root.
outputs:
  - db-setup.json confirming which DB file was initialised and table list.
  - db-summary.md human-readable summary.
definitionOfDone:
  - db-setup.json exists in the gogol output directory.
---

