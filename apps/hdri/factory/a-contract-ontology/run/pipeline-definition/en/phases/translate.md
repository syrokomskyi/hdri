---
title: Translate — Factory Observation Bundler
purpose: >-
  Discover upstream pages_*.db files, translate ext_* rows into ontology-validated
  observations, resolve cross-device conflicts with LWW, cryptographically sign,
  and emit the canonical observation bundle.
entryCriteria:
  - The upstream factory output directories exist and contain pages_*.db files.
  - An ontology.yaml is available in .input/ or via fallback.
  - A device signing key is configured via environment.
successSignals:
  - An emit-bundle directory exists with the canonical observation bundle.
  - A manifest.json confirms the observation count.
  - Conflict log captures cross-device deduplication decisions.
exitCriteria:
  - manifest.json artifact exists in the emit-bundle gogol output.
members:
  - discover-sources
  - translate-ontology
  - resolve-conflicts
  - sign-bundle
  - emit-bundle
---
