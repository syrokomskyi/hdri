# @org/site-axe-audit

Pipeline for Axe accessibility audit of live sites.

## Getting Started

1. Prepare `.input/brief.md` with `sourceToken` and database paths.
2. Install Playwright Chromium (one-time, per machine):
   ```bash
   npx playwright install chromium
   ```
3. Run from the monorepo root:
   ```bash
   pnpm turbo run start --filter=@org/site-axe-audit
   ```
4. Aggregated audit results are saved in `audits_YYYY.db`.
