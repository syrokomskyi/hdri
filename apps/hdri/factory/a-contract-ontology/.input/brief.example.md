---
# Period in YYYY-qn format (lowercase q). Hard quarterly boundary for the contract bundle.
period: "2026-q3"

# Semver of the ontology used to validate observations.
ontologyVersion: "2.0.0"

# UUID v7 minted once for this quarterly capsule.
# Shared across all factory apps for the same quarter.
capsuleId: "0198f000-0000-7000-8000-000000000000"

# Gogol IDs to skip during this run.
skipGogols: []

# Instrument plan for this quarter.
# Each entry must specify: instrument (liveness|profile|axe|lighthouse),
# state (required|disabled), and reason (null for required, non-empty string for disabled).
# If omitted entirely, defaults to Lighthouse disabled.
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
    reason: "Not configured for this quarter"
---
