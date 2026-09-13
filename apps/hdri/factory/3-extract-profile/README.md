# @syrokomskyi/site-profile

Pipeline for automated crawling and analysis of site homepages (T2 — Homepage Crawler).

## Getting Started

1. Ensure `site-liveness` is complete.
2. Prepare `.input/brief.md` with paths to `registry_YYYY.db` and the matching `liveness-YYYY-qN.db` for the quarter from `sourceToken`.
3. Run from the monorepo root:
   ```bash
   pnpm turbo run start --filter=@syrokomskyi/site-profile
   ```
4. HTML page content is saved in CAS, and metadata in `pages-YYYY-qN.db`.

## Profile closure (RFC-0104)

The required profile contract is `homepage-capture → link-discovery → detected-page-capture → signal-extraction → profile-closure`. The 2026-09-13 integration review found that child seals and contextual extraction are not fully connected; live collection remains blocked. See the factory runbook before starting.

The schema defines composite context keys. Their correct population, missing-CAS accounting and bounded result persistence still require the corrective work in RFC-0114; pagination alone does not prove bounded memory.

Run `pnpm --filter @syrokomskyi/site-profile profile:coverage --db <existing-profile.db> [--json]` for read-only row-count diagnostics. A missing DB is not created. JSON output reports `inputDbPath`, not a fabricated fingerprint; invalid row counts return a nonzero exit in either output mode. This is not capsule/work-set verification.

## Changelog

[CHANGELOG.md](CHANGELOG.md)
