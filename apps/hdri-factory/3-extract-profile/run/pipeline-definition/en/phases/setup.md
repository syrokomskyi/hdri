---
title: Phase 0 · Database Setup
purpose: >-
  Idempotently initialise pages_YYYY.db and verify upstream signatures before any
  crawling begins.
entryCriteria:
  - The output root directory is writable.
  - registry.db from 1-register-businesses is accessible at the path given in brief.registryDbPath.
  - Upstream liveness.db files and their source-signature.json manifests are discoverable.
successSignals:
  - pages_YYYY.db is created with the correct schema and _schema_meta stamped.
  - All discovered upstream liveness.db signatures verified and content hashes match.
exitCriteria:
  - db-setup.json exists in the setup-profile-db output directory.
  - verify-upstream-summary.json exists in the verify-upstream output directory.
members:
  - setup-profile-db
  - verify-upstream
---

