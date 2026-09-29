---
factory: verify-upstream
title: Verify upstream signatures
purpose: >-
  Check upstream 2-check-liveness closed snapshot manifests and snapshots before
  ingestion.
details: >-
  Loads public keys from transparency/keys/ directory. Discovers upstream
  source-signature.json manifests and their adjacent source-snapshot.sqlite files.
  Verifies v2 scope and Ed25519 signatures against the corresponding public keys,
  then checks snapshot size and SHA-256. Writes verification summary JSON and
  Markdown artifacts.
inputs:
  - '2-check-liveness/.output/<deviceId>/*-sign-source/source-snapshot.sqlite'
  - '2-check-liveness/.output/<deviceId>/*-sign-source/source-signature.json'
  - '<repo-root>/transparency/keys/*.pem'
outputs:
  - verify-upstream-summary.json
  - verify-upstream-summary.md
definitionOfDone:
  - Every discovered source snapshot has a matching verified manifest
  - Manifest scope, signature, size, and SHA-256 match the snapshot bytes
  - Verification summary written
---
