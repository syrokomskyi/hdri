---
registryDbPath: "../1-register-businesses/.output/${DEVICE_ID}/data/db/registry_2026.db"
livenessDbPath: "../2-check-liveness/.output/${DEVICE_ID}/data/db/liveness_2026.db"

auditSampleSize: -1

concurrency: 12
timeoutMs: 60000
retries: 2
fixtureDir: ""

skipGogols: []
---