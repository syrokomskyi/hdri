---
concurrency: 5
timeoutMs: 60000
retries: 1
---

# Lighthouse Audit Brief

This brief configures the Lighthouse performance audit.

## What This Does

- Reads all live sites from `registry.db`
- Runs Lighthouse performance audit for each site
- Stores results in `audits_YYYY.db`

## Required Input

- `registry_YYYY.db` from `1-register-businesses` (contains live site list)

## Configuration

| Field | Description | Default |
|-------|-------------|---------|
| `concurrency` | Parallel audits (Chrome instances) | 5 |
| `timeoutMs` | Audit timeout | 60000 |
| `retries` | Retry attempts | 1 |

## Output

- `audits_YYYY.db` — lighthouse_runs table with performance metrics
- `data/audit-reports/` — CAS storage for raw Lighthouse JSON

## Prerequisites

Requires Chrome/Chromium installed. Uses `@org/lighthouse` package.
