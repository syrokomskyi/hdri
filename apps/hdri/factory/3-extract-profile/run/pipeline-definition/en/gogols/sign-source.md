---
factory: sign-source
title: Sign source
purpose: >-
  Create and cryptographically seal a closed pages SQLite snapshot for downstream
  verification and traceability.
details: >-
  Copies the final pages-YYYY-qN.db generation to source-snapshot.sqlite, validates
  the closed copy, and writes an hdri-source-signature@2 manifest with scope,
  snapshot metadata, domain counts, and Ed25519 signature,
  sign-source-summary.json, and sign-source-summary.md.
inputs:
  - pages-YYYY-qN.db (final, fully populated)
outputs:
  - source-snapshot.sqlite
  - source-signature.json (v2 Ed25519 signature manifest)
  - sign-source-summary.json
  - sign-source-summary.md
definitionOfDone:
  - Closed snapshot passes integrity and size/hash checks
  - Complete v2 manifest is signed with the device signing key
---
