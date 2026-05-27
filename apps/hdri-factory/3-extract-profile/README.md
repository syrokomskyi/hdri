# @org/site-profile

Pipeline for automated crawling and analysis of site homepages (T2 — Homepage Crawler).

## Getting Started

1. Ensure `site-liveness` is complete.
2. Prepare `.input/brief.md` with paths to `registry.db` and `liveness.db`.
3. Run from the monorepo root:
   ```bash
   pnpm turbo run start --filter=@org/site-profile
   ```
4. HTML page content is saved in CAS, and metadata in `pages_YYYY.db`.
