---
title: Ingest Asset States
factory: ingest-asset-states
summary: >
  Reads the upstream core.db sites table and creates or updates asset_states
  in the observatory database. Each domain becomes a digital asset with a
  deterministic asset_id.
decisionType: auto
artifacts:
  - id: ingest-summary
    format: json
    description: JSON with counts of new/updated/total assets
---

# Ingest Asset States

Maps core.db sites → observatory asset_states with deterministic IDs.
