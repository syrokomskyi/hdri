---
factory: sign-source
title: Sign Source
purpose: Cryptographically sign the final registry_YYYY.db for downstream integrity verification.
details: >-
  Computes SHA-256 hash of the registry_YYYY.db, creates an ed25519 signature
  using the device signing key, and writes source-signature.json with the
  content hash, signing key ID, and signature. Seals the pipeline output.
inputs:
  - registry_YYYY.db.
  - Device signing key from environment variable.
outputs:
  - source-signature.json with content_hash, signing_key_id, and signature.
definitionOfDone:
  - source-signature.json exists with valid signature.
---
