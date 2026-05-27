---
period: "2026-q2"
ontologyVersion: "1.0.0"

# Upstream database paths (read-only) — pattern matches other factory apps
harvestDbPath: "../0-harvest-source/.output/${DEVICE_ID}/data/db/core_2026.db"
registryDbPath: "../1-register-businesses/.output/${DEVICE_ID}/data/db/registry_2026.db"
livenessDbPath: "../2-check-liveness/.output/${DEVICE_ID}/data/db/liveness_2026.db"
profileDbPath: "../3-extract-profile/.output/${DEVICE_ID}/data/db/pages-2026-h1.db"
lighthouseDbPath: "../4-audit-lighthouse/.output/${DEVICE_ID}/data/db/lighthouse_2026.db"
axeDbPath: "../5-audit-axe/.output/${DEVICE_ID}/data/db/axe_2026.db"

skipGogols: []
---
