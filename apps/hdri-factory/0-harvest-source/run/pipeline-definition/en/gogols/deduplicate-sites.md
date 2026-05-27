---
factory: deduplicate-sites
title: Deduplicate Sites
purpose: >-
  Analyse cross-batch and within-batch duplication; report on the structural
  deduplication that the UNIQUE(domain) constraint enforces automatically.
details: >-
  The sites table enforces domain uniqueness at the DB level. This gogol therefore
  reports — not modifies — the deduplication state: how many sites are new vs
  returning, how many domains were scraped from >1 catalog source, and the total
  all-time unique domain count. The operator uses this report to assess catalog
  overlap and decide whether additional catalog sources add diversity.
inputs:
  - core.db sites and site_source_seeds for this harvest batch.
outputs:
  - dedup-report.json — deduplication stats.
  - dedup-report.md — human-readable deduplication summary.
definitionOfDone:
  - dedup-report.json exists in the gogol output directory.
---

