---
title: Seal capsule
factory: seal-capsule
summary: >
  Transitions the capsule candidate from "candidate" to "sealed" state and
  signs the capsule manifest with the collector's ed25519 key.
decisionType: auto
---

# Seal capsule

Reads `capsule-candidate.json`, transitions state to `sealed`, and calls
`sealQuarterCapsule` to produce `capsule-manifest.json` and
`capsule-signature.json`. This is a technical closure step — it does not
validate scientific gates or publish anything.
