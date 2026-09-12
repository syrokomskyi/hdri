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

This pipeline implements origin-aware profile evidence with a frozen internal stage graph: `homepage-capture → link-discovery → detected-page-capture → signal-extraction → profile-closure`.

All `ext_*` tables use a composite context key `(asset_id, page_observation_id, effective_url, content_sha256, extractor_ver, policy_hash)` to ensure identical HTML at different origins retains separate owners. Detected-page ownership uses explicit context keys instead of `LIMIT 1` guessing. The extraction runner paginates at ≤256 pending rows per batch.

Run `pnpm --filter @syrokomskyi/site-profile profile:coverage -- --capsule <path> [--json]` for coverage diagnostics.

## Changelog

[CHANGELOG.md](CHANGELOG.md)
