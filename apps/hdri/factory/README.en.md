# HDRI Factory

> [Deutsche Version](README.md) · [Runbook](RUNBOOK.md)

Crawl factory components that collect raw signals and prepare them for the Digital Observatory.

## Pipeline chain

```
0-harvest-source → 1-register-businesses → 2-check-liveness → 3-extract-profile → 4-audit-lighthouse → 5-audit-axe
     ↓                     ↓                      ↓                    ↓                    ↓                    ↓
  core_YYYY.db       registry_YYYY.db       liveness-YYYY-qN.db pages-YYYY-qN.db lighthouse-YYYY-qN.db   axe-YYYY-qN.db
```

Each pipeline depends on the previous one. **Always run in this order.**

Each new quarter folder contains only new source files. Known domains may occur again: Harvest records the new source occurrence while retaining the same stable asset identity. Fully processed batches are sealed as immutable ledger segments; the same batch name with different bytes is rejected. Previously sealed `.input` and `.output` artifacts are never overwritten or deleted.

## Phase overview

| Phase | Purpose | Output |
| --- | --- | --- |
| `0-harvest-source` | Ingest source catalogs from public directories (chambers of crafts, IHK, trade listings), parse business data | `core_YYYY.db` |
| `1-register-businesses` | Deduplicate domains, mint deterministic asset IDs | `registry_YYYY.db` |
| `2-check-liveness` | Check HTTP/HTTPS availability | `liveness-YYYY-qN.db` |
| `3-extract-profile` | Crawl homepages and extract signals | `pages-YYYY-qN.db` |
| `4-audit-lighthouse` | Run optional Lighthouse performance audits | `lighthouse-YYYY-qN.db` |
| `5-audit-axe` | Run axe accessibility audits | `axe-YYYY-qN.db` |

Note: HDRI scoring and publication live in `apps/hdri/observatory`, not here.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/)
- Chrome/Chromium (for audit pipelines)
- Playwright Chromium (for `5-audit-axe`):
  ```bash
  npx playwright install chromium
  ```

## Install

```bash
pnpm install
```

## Quick start

1. **Build shared packages**:

   ```bash
   pnpm turbo run build --filter=@syrokomskyi/pipeline-core --filter=@syrokomskyi/pipeline-node --filter=@syrokomskyi/pipeline-steps
   ```

2. **Run the pipeline chain**:

   ```bash
   # Phase 0: Harvest sources
   pnpm turbo run start --filter=@syrokomskyi/catalog-harvest

   # Phase 1: Register businesses
   pnpm turbo run start --filter=@syrokomskyi/register-businesses

   # Phase 2: Check liveness
   pnpm turbo run start --filter=@syrokomskyi/site-liveness

   # Phase 3: Extract profiles
   pnpm turbo run start --filter=@syrokomskyi/site-profile

   # Phase 4: Lighthouse is disabled by the Q3 2026 instrument plan

   # Phase 5: axe audits
   pnpm turbo run start --filter=@syrokomskyi/site-axe-audit
   ```

For Q3, run the chain without phase 4; a missing Lighthouse value means `disabled`, never null or zero.

Or run the configured chain at once:

```bash
pnpm turbo run start --filter=@syrokomskyi/catalog-harvest --filter=@syrokomskyi/register-businesses --filter=@syrokomskyi/site-liveness --filter=@syrokomskyi/site-profile --filter=@syrokomskyi/site-axe-audit
```

## Configuration

Each phase has its own `brief.md` in `<phase>/.input/brief.md`. Shared configurations (e.g. `zipcodesTablePath`) are read from `apps/hdri/factory/.input/brief.md` and merged with the app-local `brief.md`.

## Privacy and k-anonymity

The publication pipeline enforces k-anonymity:

- Default mode is `enforce` (fails if any stratum has fewer than effective k=12 sites)
- Override to `warn` for development only
- Publication mode `public` omits identifying data (domain, gewerk, bundesland, real site_id)
- Publication mode `internal` includes identifying data for internal use

## Output artifacts

After the complete chain:

```
apps/hdri/factory/
  0-harvest-source/.output/
    core_YYYY.db               # Site catalog
    _guide/0-harvest-source/   # Reports
    <step>-sign-source/        # Signature manifest
  1-register-businesses/.output/
    registry_YYYY.db           # Deduplicated business registry
    <step>-sign-source/        # Signature manifest
  2-check-liveness/.output/
    liveness-YYYY-qN.db        # Availability status for this quarter
  3-extract-profile/.output/
    pages-YYYY-qN.db           # Page observations + ext_* signals
    data/content/              # CAS HTML storage
  4-audit-lighthouse/.output/
    lighthouse-YYYY-qN.db      # optional Lighthouse metrics
    data/audit-reports/        # CAS audit JSON
  5-audit-axe/.output/
    axe-YYYY-qN.db             # axe violations for this quarter
    data/audit-reports/        # CAS audit JSON
```

## Further documentation

- [`AGENTS.md`](./AGENTS.md) — AI agent guide for the factory pipeline
- [`RUNBOOK.md`](./RUNBOOK.md) — Operator runbook
- [`apps/hdri/observatory`](../observatory) — Asset state tracking, HDRI scoring, mart generation
- [`METHODOLOGY.en.md`](../../METHODOLOGY.en.md) — Scientific methodology of the HDRI
- [`GOVERNANCE.en.md`](../../GOVERNANCE.en.md) — Project governance and roles
