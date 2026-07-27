---
factory: resolve-conflicts
title: Resolve Conflicts
purpose: >-
  Deduplicate observations across devices using last-writer-wins conflict
  resolution per (asset_id, signal_path) key.
details: >-
  Groups observations by `${asset_id}\x00${signal_path}` and keeps the
  observation with the latest recorded_at. Ties are broken lexicographically
  by device_id. Conflicts are logged to conflict-log.ndjson with both
  winner and loser metadata.
inputs:
  - All translated observations from translate-ontology.
outputs:
  - conflict-log.ndjson — NDJSON log of every conflict and its resolution.
definitionOfDone:
  - Only the winning observation per key survives in pipeline state.
---
