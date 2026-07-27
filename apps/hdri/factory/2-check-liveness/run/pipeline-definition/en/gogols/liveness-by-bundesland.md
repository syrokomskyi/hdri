---
factory: liveness-by-bundesland
title: Liveness Metrics by Bundesland
purpose: >-
  Enrich liveness_checks with bundesland from registry.db and produce a per-state
  breakdown of liveness metrics (checked, live, dead, avg latency).
details: >-
  Reads sites.bundesland from registry.db, writes it to liveness_checks.bundesland
  for the current batch, then aggregates metrics grouped by state.
inputs:
  - registry.db — sites.bundesland.
  - liveness.db — liveness_checks for the current batch.
outputs:
  - liveness-by-bundesland.json — per-state metrics.
  - liveness-by-bundesland.md — human-readable liveness breakdown table.
definitionOfDone:
  - liveness-by-bundesland.json exists in the gogol output directory.
---
