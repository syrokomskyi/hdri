---
title: Phase 1 · Harvest
purpose: >-
  Parse data source files, register unique domains, classify Branche,
  report deduplication stats, and snapshot the final core.db for downstream use.
entryCriteria:
  - core.db is initialised (Phase 0 complete).
  - At least one batch directory with CSV or HTML source files exists.
successSignals:
  - All source files parsed and sites registered in core.db.
  - gewerk_group populated for classifiable sites.
  - bundesland populated for sites with a resolvable postal_code or city.
  - harvest-snapshot.json written with SHA-256 of core.db.
exitCriteria:
  - harvest-snapshot.json and harvest-snapshot.md exist in the snapshot-harvest output directory.
members:
  - parse-sources
  - classify-branche
  - enrich-bundesland
  - deduplicate-sites
  - snapshot-harvest
  - sign-source
---

