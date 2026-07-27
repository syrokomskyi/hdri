---
title: Setup Observatory Run
factory: setup-observatory-run
summary: >
  Initialises the observatory run: creates run_id, sets up the observatory
  SQLite database with observations/asset_states tables, and records
  pipeline run metadata.
decisionType: auto
artifacts:
  - id: run-meta
    format: json
    description: JSON with run_id, period, ontology_version, started_at
---

# Setup Observatory Run

Creates the observatory.db file, applies DDL migrations, stamps run metadata.
