---
title: Harvest
summary: >
  Sets up the observatory run. Asset state ingestion is handled by
  SyncFromFactoryGogol via the emit-bundle asset-states.ndjson artifact.
members:
  - id: setup-observatory-run
---

# Phase: Harvest

Initialises the pipeline run, assigns run_id, and prepares the observatory DB.
Asset states are ingested during the Observe phase from the factory emit-bundle.
