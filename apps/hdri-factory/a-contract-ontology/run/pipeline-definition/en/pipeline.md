---
title: Contract Ontology — Observation Bundler
quickStart:
  - Place brief.md and ontology.yaml in .input/ before running.
  - Pipeline discovers upstream pages_*.db from 3-extract-profile.
  - Translates ext_* rows into signed observation bundles.
  - The emit-bundle output is the data contract for apps/digital-observatory.
operatingRules:
  - Observations use last-writer-wins conflict resolution by recorded_at.
  - Unknown signals are skipped with a warning artifact.
  - The bundle is cryptographically signed before emission.
members:
  - id: translate
---
