---
factory: verify-upstream
title: Verify upstream signatures
purpose: >-
  Check ed25519 signatures on every upstream 1-register-businesses registry.db
  before ingestion.
details: >-
  Loads public keys from transparency/keys/ directory. Discovers upstream
  registry.db files and their source-signature.json manifests. Verifies ed25519
  signatures against the corresponding public keys. Re-computes SHA-256 of each
  registry.db and compares it to the signed content hash. Writes verification
  summary JSON and Markdown artifacts.
inputs:
  - '1-register-businesses/.output/<deviceId>/data/db/registry_YYYY.db'
  - '1-register-businesses/.output/<deviceId>/*-sign-source/source-signature.json'
  - '<repo-root>/transparency/keys/*.pem'
outputs:
  - verify-upstream-summary.json
  - verify-upstream-summary.md
definitionOfDone:
  - All discovered registry.db files have a matching verified signature
  - Content hash in each manifest matches the re-computed SHA-256 of registry.db
  - Verification summary written
---
