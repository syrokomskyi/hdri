---
factory: verify-upstream
title: Verify upstream signatures
purpose: >-
  Check ed25519 signatures on upstream 2-check-liveness liveness.db before
  ingestion.
details: >-
  Loads public keys from transparency/keys/ directory. Discovers upstream
  liveness.db files and their source-signature.json manifests. Verifies ed25519
  signatures against the corresponding public keys. Re-computes SHA-256 of each
  liveness.db and compares it to the signed content hash. Writes verification
  summary JSON and Markdown artifacts.
inputs:
  - '2-check-liveness/.output/<deviceId>/data/db/liveness_YYYY.db'
  - '2-check-liveness/.output/<deviceId>/*-sign-source/source-signature.json'
  - '<repo-root>/transparency/keys/*.pem'
outputs:
  - verify-upstream-summary.json
  - verify-upstream-summary.md
definitionOfDone:
  - All discovered liveness.db files have a matching verified signature
  - Content hash in each manifest matches the re-computed SHA-256 of liveness.db
  - Verification summary written
---
