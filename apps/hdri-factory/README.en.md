# HDRI Factory

> [Deutsche Version](README.md) · [Runbook](RUNBOOK.md)

Crawl factory components that collect raw signals and prepare them for the Digital Observatory.

## Pipeline chain

```
0-harvest-source → 1-register-businesses → 2-check-liveness → 3-extract-profile → 4-audit-lighthouse → 5-audit-axe
     ↓                     ↓                      ↓                    ↓                    ↓                    ↓
  core_YYYY.db       registry_YYYY.db       liveness_YYYY.db    pages_YYYY.db    lighthouse_YYYY.db      axe_YYYY.db
```

Each pipeline depends on the previous one. **Always run in this order.**

## Phase overview

| Phase | Purpose | Output |
|---|---|---|
| `0-harvest-source` | Ingest source catalogs from public directories (chambers of crafts, IHK, trade listings), parse business data | `core_YYYY.db` |
| `1-register-businesses` | Deduplicate domains, mint deterministic asset IDs | `registry_YYYY.db` |
| `2-check-liveness` | Check HTTP/HTTPS availability | `liveness_YYYY.db` |
| `3-extract-profile` | Crawl homepages, extract 42 signal types | `pages_YYYY.db` |
| `4-audit-lighthouse` | Run Lighthouse performance audits | `lighthouse_YYYY.db` |
| `5-audit-axe` | Run axe accessibility audits | `axe_YYYY.db` |

Note: HDRI scoring and publication live in `apps/digital-observatory`, not here.

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
   pnpm turbo run build --filter=@org/pipeline-core --filter=@org/pipeline-node --filter=@org/pipeline-steps
   ```

2. **Run the pipeline chain**:
   ```bash
   # Phase 0: Harvest sources
   pnpm turbo run start --filter=@org/catalog-harvest

   # Phase 1: Register businesses
   pnpm turbo run start --filter=@org/register-businesses

   # Phase 2: Check liveness
   pnpm turbo run start --filter=@org/site-liveness

   # Phase 3: Extract profiles
   pnpm turbo run start --filter=@org/site-profile

   # Phase 4: Lighthouse audits
   pnpm turbo run start --filter=@org/site-lighthouse-audit

   # Phase 5: axe audits
   pnpm turbo run start --filter=@org/site-axe-audit
   ```

Or run the entire chain at once:
```bash
pnpm turbo run start --filter=@org/catalog-harvest --filter=@org/register-businesses --filter=@org/site-liveness --filter=@org/site-profile --filter=@org/site-lighthouse-audit --filter=@org/site-axe-audit
```

## Configuration

Each phase has its own `brief.md` in `<phase>/.input/brief.md`. Shared configurations (e.g. `zipcodesTablePath`) are read from `apps/hdri-factory/.input/brief.md` and merged with the app-local `brief.md`.

## Privacy and k-anonymity

The publication pipeline enforces k-anonymity:

- Default mode is `enforce` (fails if any stratum has fewer than k_min=5 sites)
- Override to `warn` for development only
- Publication mode `public` omits identifying data (domain, gewerk, bundesland, real site_id)
- Publication mode `internal` includes identifying data for internal use

## Output artifacts

After the complete chain:

```
apps/hdri-factory/
  0-harvest-source/.output/
    core_YYYY.db               # Site catalog
    _guide/0-harvest-source/   # Reports
    <step>-sign-source/        # Signature manifest
  1-register-businesses/.output/
    registry_YYYY.db           # Deduplicated business registry
    <step>-sign-source/        # Signature manifest
  2-check-liveness/.output/
    liveness_YYYY.db           # Availability status
  3-extract-profile/.output/
    pages_YYYY.db              # Page observations + ext_* signals
    data/content/              # CAS HTML storage
  4-audit-lighthouse/.output/
    lighthouse_YYYY.db         # Lighthouse metrics
    data/audit-reports/        # CAS audit JSON
  5-audit-axe/.output/
    axe_YYYY.db                # axe violations
    data/audit-reports/        # CAS audit JSON
```

## Further documentation

- [`AGENTS.md`](./AGENTS.md) — AI agent guide for the hdri-factory pipeline
- [`RUNBOOK.md`](./RUNBOOK.md) — Operator runbook
- [`apps/digital-observatory`](../digital-observatory) — Asset state tracking, HDRI scoring, mart generation
- [`METHODOLOGY.en.md`](../../METHODOLOGY.en.md) — Scientific methodology of the HDRI
- [`GOVERNANCE.en.md`](../../GOVERNANCE.en.md) — Project governance and roles
