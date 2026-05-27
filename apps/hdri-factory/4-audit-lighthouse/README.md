# @org/site-lighthouse-audit

Pipeline for Lighthouse performance audit of live sites.

## Getting Started

1. Prepare `.input/brief.md` with `sourceToken` and database paths.
2. Run from the monorepo root:
   ```bash
   pnpm turbo run start --filter=@org/site-lighthouse-audit
   ```
3. Aggregated audit results are saved in `audits_YYYY.db`.
