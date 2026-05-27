---
factory: load-audit-cohort
title: Load Audit Cohort
purpose: >-
  Read all live sites from registry.db to build the audit target list.
details: >-
  Opens registry.db read-only and selects all live sites,
  joining the sites table for domain and homepage URL.
  Computes a stable SHA-256 of the target list for reproducibility.
inputs:
  - registry.db at brief.registryDbPath (read-only).
outputs:
  - audit-cohort.json — targets, sha256.
  - audit-cohort.md — human-readable cohort summary.
definitionOfDone:
  - audit-cohort.json exists and contains at least one target.
---

