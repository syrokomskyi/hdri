---
factory: verify-upstream
title: Verify upstream signatures
purpose: >-
  Check ed25519 signatures on upstream 3-extract-profile pages-YYYY-qN.db before
  ingestion.
details: >-
  Loads public keys from transparency/keys/ directory. Discovers upstream
  pages-YYYY-qN.db files and their source-signature.json manifests. Verifies ed25519
  signatures against the corresponding public keys. Re-computes SHA-256 of each
  pages-YYYY-qN.db and compares it to the signed content hash. Writes verification
  summary JSON and Markdown artifacts.
inputs:
  - '3-extract-profile/.output/<deviceId>/data/db/pages-YYYY-qN.db'
  - '3-extract-profile/.output/<deviceId>/*-sign-source/source-signature.json'
  - '<repo-root>/transparency/keys/*.pem'
outputs:
  - verify-upstream-summary.json
  - verify-upstream-summary.md
definitionOfDone:
  - All discovered pages-YYYY-qN.db files have a matching verified signature
  - Content hash in each manifest matches the re-computed SHA-256 of pages-YYYY-qN.db
  - Verification summary written
---
