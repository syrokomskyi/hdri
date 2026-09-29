---
registryDbPath: "../1-register-businesses/.output/${DEVICE_ID}/data/db/registry_2026.db"
livenessDbPath: "../2-check-liveness/.output/${DEVICE_ID}/data/db/liveness-2026-q3.db"

# FULL RUN: audit all targets for the Q3 2026 snapshot.
auditSampleSize: -1

concurrency: 32
timeoutMs: 60000
retries: 2
poolSize: 16
recycleAfterTargets: 200
fixtureDir: ""

skipGogols: []
instrumentPlan:
  - instrument: liveness
    state: required
    reason: null
  - instrument: profile
    state: required
    reason: null
  - instrument: axe
    state: required
    reason: null
  - instrument: lighthouse
    state: disabled
    reason: "Not configured for Q3 2026"
---
