---
title: Phase 1 · Crawl
purpose: >-
  Fetch homepages for all live domains and store raw HTML in CAS storage.
entryCriteria:
  - pages_YYYY.db is initialised (Phase 0 complete).
  - liveness.db from site-liveness is accessible at the path given in brief.livenessDbPath.
  - registry.db from register-businesses is accessible read-only at the path given in brief.registryDbPath.
successSignals:
  - All targeted domains have a page_observations row for this batch.
  - crawl-report.json written with fetch counts.
exitCriteria:
  - crawl-report.json exists in the crawl gogol output directory.
members:
  - crawl-pages
---

