---
# Upstream registry.db (read-only) from 1-register-businesses
registryDbPath: "../1-register-businesses/.output/${DEVICE_ID}/data/db/registry_2026.db"
# Upstream liveness.db (read-only) from 2-check-liveness
livenessDbPath: "../2-check-liveness/.output/${DEVICE_ID}/data/db/liveness_2026.db"

auditSampleSize: 3

# Tool config
formFactor: mobile

concurrency: 1
timeoutMs: 120000
retries: 2
fixtureDir: ""

skipGogols: []
---