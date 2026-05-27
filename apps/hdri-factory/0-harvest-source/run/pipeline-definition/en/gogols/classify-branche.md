---
factory: classify-branche
title: Classify Branche → HWO UID + Destatis Group
purpose: >-
  Classify each site to an official HWO 2021 trade UID (e.g. "A-24", "B1-03")
  and resolve it to a Destatis Gewerbegruppe (I–VII) using the two-layer
  classifier from @org/business-core. Sites appearing in multiple sources with
  different categories are classified based on ALL unique categories collected
  across all sources.
details: >-
  Collects ALL unique category values from site_source_seeds for each site in
  this harvest batch. For each site the classifier runs three passes in order:
  (1) exact HWO UID match from category keywords; (2) HWO UID match from domain
  and business_name signals; (3) heuristic Destatis group fallback when no UID
  is found. The winning UID and confidence score are written to sites.hwo_uid,
  sites.hwo_confidence, and sites.hwo_provenance. The resolved Destatis mapping
  (code, label) is written to site_hwo_mappings with mapping_system =
  "destatis_group". Sites that yield neither a UID nor a group remain
  'unclassified'.
inputs:
  - site_source_seeds.category for all seeds in this harvest batch (aggregated per site).
outputs:
  - classify-report.json — classified/unclassified counts, HWO UID distribution, and Destatis group distribution.
  - classify-report.md — human-readable classification summary with per-group tables.
  - classifications.csv — per-site classification details (hwo_uid, destatis_code, destatis_label, provenance, categories).
definitionOfDone:
  - classify-report.json exists in the gogol output directory.
---

