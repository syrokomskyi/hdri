---
factory: sign-source
title: Sign Source
purpose: >-
  Create and cryptographically seal a closed source SQLite snapshot for
  downstream pipelines.
details: >-
  Copies the final core.db generation to an adjacent source-snapshot.sqlite,
  validates the closed copy, and writes an hdri-source-signature@2 manifest
  covering the complete canonical metadata, snapshot size, SHA-256, and row
  counts. Downstream pipelines must verify the manifest and snapshot before use.
inputs:
  - core.db (final, fully populated).
outputs:
  - source-snapshot.sqlite — immutable closed SQLite snapshot.
  - source-signature.json — v2 Ed25519 signature manifest.
  - sign-source-summary.json — machine-readable signing metadata.
  - sign-source-summary.md — human-readable signing report.
definitionOfDone:
  - source-signature.json exists and contains a valid ed25519 signature.
  - sign-source-summary.json and sign-source-summary.md are written.
---
