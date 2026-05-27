---
title: Catalog Harvest — T0 Ingestion Pipeline
quickStart:
  - Create apps/hdri-factory/0-harvest-source/.input/brief.md with harvestYear, harvestQuarter, batchToken.
  - Place CSV/HTML catalog files under .input/batches/<batch-name>/.
  - Run the pipeline; review artifacts in .output/ after each phase.
  - The final core.db snapshot is the data contract for downstream pipelines (site-liveness, site-profile, hdri-scoring).
operatingRules:
  - Each run is idempotent — re-run safely without data loss.
  - harvestBatchId is derived from brief fields; same brief = same batch ID.
  - Stop-domains are filtered automatically; review seeds-skipped.csv for details.
  - GewerkGroup is set by rule-based keyword matching; unclassified sites require LLM review in a later phase.
members:
  - db-setup
  - harvest
---

