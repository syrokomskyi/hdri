---
factory: mint-asset-ids
title: Mint Asset IDs
purpose: Mint deterministic da-* asset IDs for every domain in the registry.
details: >-
  For each domain in registry_YYYY.db, derives a deterministic asset ID
  using the domain hash. Writes the mapping to the database for downstream
  observatory consumption.
inputs:
  - registry_YYYY.db with merged domains.
outputs:
  - registry_YYYY.db with asset IDs populated.
  - asset-id-report.md with mapping summary.
definitionOfDone:
  - asset ID column populated for all rows.
---
