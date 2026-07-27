---
factory: sign-source
title: Sign source
purpose: >-
  Create cryptographic signature over pages_YYYY.db file hash for downstream
  verification and traceability.
details: >-
  Computes SHA-256 hash of the final pages_YYYY.db file. Creates ed25519
  signature manifest with source metadata. Writes source-signature.json manifest,
  sign-source-summary.json, and sign-source-summary.md.
inputs:
  - pages_YYYY.db (final, fully populated)
outputs:
  - source-signature.json (ed25519 signature manifest)
  - sign-source-summary.json
  - sign-source-summary.md
definitionOfDone:
  - SHA-256 of pages_YYYY.db computed
  - ed25519 signature created with device signing key
  - Signature manifest written with key ID and timestamp
---
