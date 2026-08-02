---
factory: merge-registry
title: Merge Registry
purpose: Merge distinct domains from all discovered core DBs into a device-local registry.
details: >-
  Reads sites from each discovered core_YYYY.db, deduplicates by domain
  across all devices, aggregates site counts and geographic metadata, and
  writes the merged registry to registry_YYYY.db.
inputs:
  - Discovered core_YYYY.db files.
outputs:
  - registry_YYYY.db with deduplicated domains.
  - merge-report.json with domain counts and deduplication stats.
definitionOfDone:
  - registry_YYYY.db exists.
  - merge-report.json exists.
---
