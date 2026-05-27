---
title: Digital Observatory Pipeline
quickStart:
  - Place brief.md and codebook.yaml in .input/ before running.
  - Pipeline reads factory emit-bundles from a-contract-ontology.
  - Scores are versioned by codebook; public output enforces k-anonymity.
operatingRules:
  - Observations are append-only and never overwritten.
  - Signal paths must be validated against the ontology before write.
  - Scores are versioned by codebook; old scores are never deleted.
  - Public output enforces k-anonymity with minimum group size 5.
members:
  - id: harvest
  - id: observe
  - id: interpret
  - id: publish
---

# Digital Observatory

Asset-centric longitudinal observatory for digital presence analysis.
Four phases: Harvest → Observe → Interpret → Publish.
