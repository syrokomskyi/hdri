---
factory: sign-bundle
title: Sign Bundle
purpose: >-
  Cryptographically sign each resolved observation using the device ed25519
  signing key.
details: >-
  Loads the signing key from the environment (SIGNING_KEY / SIGNING_KEY_ID).
  Strips the internal _device_id helper field before signing each observation.
  Signed observations are passed to emit-bundle for final emission.
inputs:
  - Resolved observations from resolve-conflicts.
  - SIGNING_KEY and SIGNING_KEY_ID environment variables.
outputs:
  - (no artifacts — signed observations passed in pipeline state).
definitionOfDone:
  - Every resolved observation has a corresponding signed variant.
---
