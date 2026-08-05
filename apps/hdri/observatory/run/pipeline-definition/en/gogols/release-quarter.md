---
title: Release quarter
factory: release-quarter
summary: >
  Replicates sealed artifacts to two offsite destinations, publishes the
  public archive, and signs the QuarterReleaseManifest.
decisionType: auto
---

# Release quarter

Reads the sealed `capsule-manifest.json` and the passed
`validation-report.json`, replicates all artifacts to at least two offsite
destinations, publishes the public archive directory, and signs the
`QuarterReleaseManifest` with the collector's ed25519 key.
