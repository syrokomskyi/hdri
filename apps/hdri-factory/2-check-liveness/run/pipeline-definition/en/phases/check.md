---
title: Phase 1 · Liveness Check
purpose: >-
  Read all domains from registry.db, check HTTP/HTTPS reachability, write results
  to liveness.db, and snapshot the final DB for downstream integrity.
entryCriteria:
  - liveness.db is initialised (Phase 0 complete).
  - registry.db from 1-register-businesses is accessible at the path given in brief.registryDbPath.
successSignals:
  - All domains from registry.db have a liveness_checks row for this batch.
  - liveness-snapshot.json written with SHA-256 of liveness.db.
exitCriteria:
  - liveness-snapshot.json exists and contains a non-empty sha256 field.
members:
  - verify-upstream
  - check-liveness
  - liveness-by-bundesland
  - summarize-liveness
  - sign-source
---

