---
factory: verify-upstream
title: Verify upstream signatures
purpose: >-
  Check ed25519 signatures on upstream 4-audit-lighthouse lighthouse-YYYY-qN.db before
  ingestion.
details: >-
  Loads public keys from transparency/keys/ directory. Discovers upstream
  lighthouse-YYYY-qN.db files and their source-signature.json manifests. Verifies ed25519
  signatures against the corresponding public keys. Re-computes SHA-256 of each
  lighthouse-YYYY-qN.db and compares it to the signed content hash. Writes verification
  summary JSON and Markdown artifacts.
inputs:
  - '4-audit-lighthouse/.output/<deviceId>/data/db/lighthouse-YYYY-qN.db'
  - '4-audit-lighthouse/.output/<deviceId>/*-sign-source/source-signature.json'
  - '<repo-root>/transparency/keys/*.pem'
outputs:
  - verify-upstream-summary.json
  - verify-upstream-summary.md
definitionOfDone:
  - All discovered lighthouse-YYYY-qN.db files have a matching verified signature
  - Content hash in each manifest matches the re-computed SHA-256 of lighthouse-YYYY-qN.db
  - Verification summary written
---
