# @syrokomskyi/site-axe-audit

Pipeline for Axe accessibility audit of live sites.

## RFC-0105: Bound browser measurements

This app implements RFC-0105 — browser instruments execute as resource-bounded isolated tasks with typed `BrowserEvidence` contracts. A supervised worker pool (ADR-0023) replaces per-target browser launches. A preflight self-test gates instrument readiness before acquiring target leases.

### Worker pool configuration

| Field                 | Default | Description                    |
| --------------------- | ------- | ------------------------------ |
| `poolSize`            | 4       | Number of worker processes     |
| `recycleAfterTargets` | 20      | Recycle worker after N targets |
| `deadlineMs`          | 120000  | Total deadline per target      |
| `terminationGraceMs`  | 5000    | Grace period before SIGKILL    |

## Getting Started

1. Prepare `.input/brief.md` with `sourceToken` and database paths.
2. Install Playwright Chromium (one-time, per machine):
   ```bash
   npx playwright install chromium
   ```
3. Run from the monorepo root:
   ```bash
   pnpm turbo run start --filter=@syrokomskyi/site-axe-audit
   ```
4. Aggregated audit results are saved in `audits_YYYY.db`.

## Changelog

[CHANGELOG.md](CHANGELOG.md)
