---
title: Observe
summary: >
  Translates raw pipeline signals into ontology-backed observations.
  Each observation is validated against the signal ontology before write.
members:
  - sync-from-factory
  - sign-observations
  - mint-asset-ids
---

# Phase: Observe

Reads ext_* tables and audit results from upstream, maps each signal to
its canonical signal_path, and writes validated Observation records.
