---
title: Sync From Factory
factory: sync-from-factory
summary: >
  Reads emit-bundles written by factory apps and ingests the observations into
  the observatory database. Idempotent — bundles already synced by run_id are
  skipped. Replaces TranslateProfileObservationsGogol which read factory SQLite
  directly.
decisionType: auto
artifacts:
  - id: sync-report
    format: json
    description: JSON report with per-bundle observation counts and skipped bundles
---

# Sync From Factory

Consumes factory emit-bundles (manifest.json + observations.ndjson) produced
by `EmitObservationsGogol` in `3-extract-profile` and writes them to the
observatory observations table.

The `synced_bundles` table tracks ingested `run_id` values so re-running the
observatory is safe — already-synced bundles are skipped.
