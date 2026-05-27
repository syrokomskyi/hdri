---
title: Export Mart
factory: export-mart
summary: >
  Builds privacy-safe analytical mart exports as CSV and JSON. Applies
  k-anonymity filtering on small groups and writes to .output/mart/.
decisionType: auto
artifacts:
  - id: mart-manifest
    format: json
    description: JSON listing exported files, row counts, and filter stats
---

# Export Mart

Reads scores + cohort aggregates, applies k-anonymity (group min size 5),
writes CSV/JSON mart files for downstream consumption.

> Why "mart"?  
> A *data mart* is a cleaned, consumer-ready subset of a larger data warehouse.
> This step turns internal vault tables into public CSV/JSON slices — the shop floor,
> not the stockroom.
