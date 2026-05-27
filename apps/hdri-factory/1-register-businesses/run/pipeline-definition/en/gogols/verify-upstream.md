---
factory: verify-upstream
title: Verify Upstream
purpose: Verify ed25519 signature of upstream core.db before consuming it.
details: >-
  Discovers source-signature.json from the upstream 0-harvest-source output
  directory, loads the matching public key from transparency/keys/, verifies
  the ed25519 signature, and re-computes the SHA-256 hash to ensure integrity.
  Throws an error if any check fails.
inputs:
  - source-signature.json from 0-harvest-source output.
  - Public key from transparency/keys/<deviceId>.pem.
outputs:
  - Verification report artifact.
definitionOfDone:
  - Verification succeeds or pipeline stops with error.
---
