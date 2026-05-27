---
factory: summarize-profile
title: Summarize Profile
purpose: >-
  Compute a SHA-256 fingerprint of pages_YYYY.db and write the provenance
  record that downstream pipelines use to verify data integrity.
details: >-
  Reads aggregate stats from pages_YYYY.db (observations, unique content hashes,
  extraction counts, impressum/datenschutz/cookie/copyright year breakdowns, contact counts),
  then streams pages_YYYY.db through a SHA-256 hash. Writes profile-snapshot.json
  with the fingerprint and all key metrics. Downstream pipelines (hdri-scoring)
  should record this sha256 in their pipeline_inputs to establish a verifiable
  lineage chain. No data is modified — this is a read-only summary step.
inputs:
  - pages_YYYY.db (fully populated by crawl-pages and extract-* gogols).
outputs:
  - profile-snapshot.json — SHA-256, stats, and provenance metadata.
  - profile-snapshot.md — human-readable snapshot summary.
definitionOfDone:
  - profile-snapshot.json exists and contains a non-empty sha256 field.
---

