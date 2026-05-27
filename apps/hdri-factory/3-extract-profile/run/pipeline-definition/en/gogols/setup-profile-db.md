---
factory: setup-profile-db
title: Setup Profile DB
purpose: >-
  Idempotently create and migrate pages_YYYY.db, stamping _schema_meta.
details: >-
  Creates the DB output directory if needed, opens pages_YYYY.db (name derived
  from brief.profileYear + brief.profileHalf), runs migratePages() to create
  page_contents, page_observations, content_extractions, and content_contacts
  tables with all indexes, then stamps _schema_meta with owner_app=site-profile
  and schema_version=v1.0. Safe to re-run — all DDL uses CREATE TABLE IF NOT EXISTS.
inputs:
  - DB directory path derived from output root.
outputs:
  - db-setup.json confirming DB path, schema version, and table list.
  - db-summary.md human-readable setup summary.
definitionOfDone:
  - db-setup.json exists in the gogol output directory.
---

