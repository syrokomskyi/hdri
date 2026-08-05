---
# Path to upstream registry.db — relative to apps/hdri/factory/2-check-liveness/
# Points to 1-register-businesses output (registry_YYYY.db).
registryDbPath: "../1-register-businesses/.output/${DEVICE_ID}/data/db/registry_2026.db"

concurrency: 30
timeoutMs: 6000
retryCount: 1
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