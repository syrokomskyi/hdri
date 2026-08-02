---
factory: sign-source
title: Sign Source
purpose: >-
  Cryptographically sign the final core.db file hash to establish a
  verifiable data lineage chain for downstream pipelines.
details: >-
  Computes SHA-256 of core.db, creates an ed25519 detached signature
  over `${signing_key_id}\n${source_token}\n${content_hash}`, and writes
  a `source-signature.json` manifest. Downstream pipelines (e.g.
  1-register-businesses) must verify this signature before consuming
  the database.
inputs:
  - core.db (final, fully populated).
outputs:
  - source-signature.json — ed25519 signature manifest.
  - sign-source-summary.json — machine-readable signing metadata.
  - sign-source-summary.md — human-readable signing report.
definitionOfDone:
  - source-signature.json exists and contains a valid ed25519 signature.
  - sign-source-summary.json and sign-source-summary.md are written.
---
