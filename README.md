# HDRI Analysis Platform

A Turborepo monorepo for collecting, analysing, and publishing the **Handwerk Digital Readiness Index (HDRI)** — a longitudinal, signal-based assessment of how craft-industry businesses present themselves online.

## What this project does

The platform consists of three layers:

1. **Factory** (`apps/hdri-factory/*`) — harvests site catalogs, checks liveness, crawls homepages, and runs Lighthouse and axe audits.
2. **Observatory** (`apps/digital-observatory`) — maps raw signals to an ontology, scores them with a configurable codebook, and builds privacy-safe data marts.
3. **Dashboard** (`apps/hdri-dashboard`) — a static Astro site that visualises the scored, anonymised data for public consumption.

Engineers and analysts can run the pipelines locally, inspect intermediate SQLite databases, and rebuild the dashboard after any scoring or codebook change.

## Workspace layout

```text
apps/
  hdri-factory/
    0-harvest-source/       catalog ingestion
    1-register-businesses/  domain deduplication & asset-id minting
    2-check-liveness/       HTTP/HTTPS availability checks
    3-extract-profile/      homepage crawling & signal extraction
    4-audit-lighthouse/     Lighthouse performance audits
    5-audit-axe/            axe accessibility audits
    a-contract-ontology/    bundles signed observations for the observatory
  digital-observatory/      longitudinal scoring & cohort analysis
  hdri-dashboard/           public Astro dashboard

packages/
  business-core/            SQLite schemas & business entities
  business-crawler/         shared crawling utilities
  business-rate-limit/      rate-limiting helpers
  hdri-codebook/            YAML codebook parser & scoring engine
  hdri-factory-core/        factory-specific shared logic
  observatory-asset-id/     deterministic asset-id derivation
  observatory-core/         ontology, observations, validation
  observatory-crypto/       signing & hashing utilities
  observatory-emit/         bundle emission helpers
  observatory-vault/        secure storage abstractions
  pipeline-ai/              LLM prompt runners & response logging
  pipeline-core/            pipeline engine core (steps, phases, orchestration)
  pipeline-node/            Node.js runtime adapters
  pipeline-steps/           reusable step base classes
  utils/                    general-purpose helpers
```

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Playwright Chromium](https://playwright.dev/) (for `5-audit-axe` only):
  ```bash
  npx playwright install chromium
  ```

## Install

```bash
pnpm install
```

## Quick start

1. **Build shared packages** before running any pipeline:
   ```bash
   pnpm turbo run build --filter=@org/pipeline-core --filter=@org/pipeline-node --filter=@org/pipeline-steps --filter=@org/observatory-core --filter=@org/hdri-codebook
   ```

2. **Run a factory pipeline** (example: harvest source catalogs):
   ```bash
   pnpm turbo run start --filter=@org/catalog-harvest
   ```

3. **Run the observatory** after the factory steps are complete:
   ```bash
   pnpm --filter @org/digital-observatory start
   ```

4. **Build the dashboard**:
   ```bash
   pnpm --filter @org/hdri-dashboard run build
   ```

See the individual README files linked below for detailed configuration of each app.

## App guides

- [`apps/hdri-factory/0-harvest-source`](apps/hdri-factory/0-harvest-source/README.md) — ingest source catalogs (CSV/HTML)
- [`apps/hdri-factory/1-register-businesses`](apps/hdri-factory/1-register-businesses/README.md) — deduplicate domains across batches
- [`apps/hdri-factory/2-check-liveness`](apps/hdri-factory/2-check-liveness/README.md) — check which sites respond
- [`apps/hdri-factory/3-extract-profile`](apps/hdri-factory/3-extract-profile/README.md) — crawl live homepages
- [`apps/hdri-factory/4-audit-lighthouse`](apps/hdri-factory/4-audit-lighthouse/README.md) — run Lighthouse audits
- [`apps/hdri-factory/5-audit-axe`](apps/hdri-factory/5-audit-axe/README.md) — run axe accessibility audits
- [`apps/hdri-factory/a-contract-ontology`](apps/hdri-factory/a-contract-ontology/README.md) — bundle observations for the observatory
- [`apps/digital-observatory`](apps/digital-observatory/README.md) — score signals and build cohorts
- [`apps/hdri-dashboard`](apps/hdri-dashboard/README.md) — build the public dashboard

## Useful commands

```bash
# Type-check everything
pnpm turbo run typecheck

# Build everything
pnpm turbo run build

# Run a specific app
pnpm turbo run start --filter=@org/digital-observatory

# Visualise the task graph
pnpm turbo graph --dot > turbo.dot
```

## Pipeline conventions

Every app in `apps/*` follows the same runtime layout:

- `.input/` — manually provided configuration (`brief.md`, catalog files, etc.)
- `.output/` — generated artifacts and SQLite databases
- `run/` — source code, gogols, and orchestration

Pipelines are designed to **fail fast**: if a downstream step lacks valid upstream data, the runtime pauses, prints a diagnostic guide, and does not create an empty step directory.

Environment variables are loaded from the app-local `.env` file when the app starts.

## Turborepo references

- [Turborepo Documentation](https://turborepo.com/docs)
- [Turborepo Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Turborepo Caching](https://turborepo.com/docs/crafting-your-repository/caching)
