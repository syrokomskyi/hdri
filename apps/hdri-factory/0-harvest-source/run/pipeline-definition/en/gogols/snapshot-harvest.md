---
factory: snapshot-harvest
title: Snapshot Harvest
purpose: >-
  Compute a SHA-256 fingerprint of core.db and write the harvest provenance
  record that downstream pipelines use to verify data integrity.
details: >-
  Streams core.db through a SHA-256 hash, collects summary statistics, and
  writes harvest-snapshot.json. Downstream pipelines (site-liveness, site-profile,
  hdri-scoring) must record this sha256 in their pipeline_inputs table to establish
  a verifiable data lineage chain. No data is modified — this is a read-only audit.
inputs:
  - core.db (fully populated by previous gogols in this run).
outputs:
  - harvest-snapshot.json — SHA-256, stats, and provenance metadata.
  - harvest-snapshot.md — human-readable snapshot summary.
definitionOfDone:
  - harvest-snapshot.json exists and contains a non-empty sha256 field.
---

