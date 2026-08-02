---
concurrency: 5
timeoutMs: 45000
retries: 1
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
| `concurrency` | Parallel audits (browser instances) | 5 |
| `timeoutMs` | Page load + audit timeout | 45000 |
| `retries` | Retry attempts | 1 |

## Output

- `audits_YYYY.db` — axe_runs table with violation counts
- `data/audit-reports/` — CAS storage for raw axe JSON

## Prerequisites

Requires Playwright and `@axe-core/playwright`:
```bash
pnpm add -D playwright @axe-core/playwright
npx playwright install chromium
```
