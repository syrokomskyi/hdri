---
period: "2026-q3"
ontologyVersion: "2.0.0"
capsuleId: "019ff219-69fe-7025-943c-dae2a8c37801"

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

# RFC-0106/0128: verified source admission — per-device capsule-staging.json
# manifest (absolute path; verified signature + artifact hashes before
# upstream DBs are admitted as pipeline inputs).
inputManifestSet:
  - "/home/syrokomskyi/projects/warpgogol/pipelines/apps/hdri/capsules/andrii-zenbook/2026-q3/019ff219-69fe-7025-943c-dae2a8c37801/capsule-staging.json"
coreManifestSet:
  - "/home/syrokomskyi/projects/warpgogol/pipelines/apps/hdri/factory/0-harvest-source/.output/andrii-zenbook/7-sign-source/source-signature.json"
---
