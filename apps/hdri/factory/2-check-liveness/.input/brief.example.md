---
concurrency: 50
timeoutMs: 15000
retries: 2
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
    reason: "Not configured for this quarter"
---

# Liveness Check Brief

This brief configures the site availability checker.

## What This Does

- Reads all domains from `registry.db` (contains `sites` table from 1-register-businesses)
- Checks HTTP/HTTPS availability for each site
- Records live status in `liveness.db`

## Required Input

- `registry_YYYY.db` from upstream `1-register-businesses` must exist
- Optional: custom registryDbPath if using external registry.db

## Configuration

| Field | Description | Default |
|-------|-------------|---------|
| `concurrency` | Parallel checks | 50 |
| `timeoutMs` | Request timeout | 15000 |
| `retries` | Retry attempts | 2 |

## Output

- `liveness.db` — site availability status
