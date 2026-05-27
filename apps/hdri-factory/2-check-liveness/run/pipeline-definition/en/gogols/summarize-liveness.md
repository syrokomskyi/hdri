---
factory: summarize-liveness
title: Summarize Liveness
purpose: >-
  Compute a SHA-256 fingerprint of liveness.db and write the provenance record
  that downstream pipelines use to verify data integrity.
details: >-
  Reads aggregate stats from liveness_checks (total, live count, avg latency),
  then streams liveness.db through a SHA-256 hash. Writes liveness-snapshot.json
  with the fingerprint and all key metrics. Downstream pipelines (site-profile,
  hdri-scoring) should record this sha256 in their pipeline_inputs to establish
  a verifiable lineage chain. No data is modified — this is read-only.
inputs:
  - liveness.db (fully populated by check-liveness).
outputs:
  - liveness-snapshot.json — SHA-256, stats, and provenance metadata.
  - liveness-snapshot.md — human-readable snapshot summary.
definitionOfDone:
  - liveness-snapshot.json exists and contains a non-empty sha256 field.
---

