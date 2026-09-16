---
factory: sign-source
title: Sign Source
purpose: Create and cryptographically seal a closed registry SQLite snapshot for downstream verification.
details: >-
  Copies the final registry_YYYY.db generation to source-snapshot.sqlite,
  validates the closed copy, and writes an hdri-source-signature@2 manifest
  covering scope, snapshot size and SHA-256, domain counts, and signature.
inputs:
  - registry_YYYY.db.
  - Device signing key from environment variable.
outputs:
  - source-snapshot.sqlite.
  - source-signature.json with the v2 closed-snapshot manifest.
definitionOfDone:
  - source-signature.json and its adjacent snapshot pass v2 verification.
---
