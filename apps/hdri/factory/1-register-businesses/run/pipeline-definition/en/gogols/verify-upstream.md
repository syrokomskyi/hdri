---
factory: verify-upstream
title: Verify Upstream
purpose: Verify the upstream closed snapshot manifest before consuming it.
details: >-
  Discovers source-signature.json from the upstream 0-harvest-source output
  directory, loads the matching public key from transparency/keys/, verifies
  the v2 Ed25519 signature and scope, then checks the adjacent
  source-snapshot.sqlite size and SHA-256. Throws an error if any check fails.
inputs:
  - source-signature.json and source-snapshot.sqlite from 0-harvest-source output.
  - Public key from transparency/keys/<deviceId>.pem.
outputs:
  - Verification report artifact.
definitionOfDone:
  - Verification succeeds or pipeline stops with error.
---
