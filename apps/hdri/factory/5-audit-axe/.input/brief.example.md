---
concurrency: 5
timeoutMs: 45000
retries: 1
skipGogols: []
poolSize: 4
recycleAfterTargets: 20
deadlineMs: 120000
terminationGraceMs: 5000
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

# Axe Accessibility Audit Brief

This brief configures the axe-core accessibility audit.

## What This Does

- Reads all live sites from `registry.db`
- Runs axe-core accessibility checks for each site
- Stores violation counts in `audits_YYYY.db`

## Required Input

- `registry_YYYY.db` from `1-register-businesses` (contains live site list)

## Configuration

| Field | Description | Default |
|-------|-------------|---------|
| `concurrency` | Legacy parallel audits (now managed by pool) | 5 |
| `timeoutMs` | Page load timeout | 45000 |
| `retries` | Retry attempts | 1 |
| `poolSize` | Worker pool size (ADR-0023) | 4 |
| `recycleAfterTargets` | Recycle worker after N targets | 20 |
| `deadlineMs` | Total deadline per target (RFC-0105) | 120000 |
| `terminationGraceMs` | Grace period before SIGKILL | 5000 |

## Output

- `audits_YYYY.db` — axe_runs table with violation counts
- `data/audit-reports/` — CAS storage for raw axe JSON

## Prerequisites

Requires Playwright and `@axe-core/playwright`:
```bash
pnpm add -D playwright @axe-core/playwright
npx playwright install chromium
```
