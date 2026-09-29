---
# Upstream DBs (Phase A: configurable; Phase B: hardcoded by convention)
registryDbPath: "../1-register-businesses/.output/${DEVICE_ID}/data/db/registry_2026.db"
livenessDbPath: "../2-check-liveness/.output/${DEVICE_ID}/data/db/liveness-2026-q3.db"

concurrency: 6
timeoutMs: 20000
# FULL RUN: all live domains for the Q3 2026 snapshot.
maxDomains: -1
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
