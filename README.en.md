# HDRI Analysis Platform

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/syrokomskyi/hdri/ci.yml?logo=github-actions&logoColor=white)](https://github.com/syrokomskyi/hdri/actions)
[![Issues](https://img.shields.io/github/issues/syrokomskyi/hdri?logo=github&logoColor=white)](https://github.com/syrokomskyi/hdri/issues)

> [Deutsche Version](README.md) · [🌐 handwerk-index.de](https://handwerk-index.de)

HDRI is a measurement tool that regularly checks how craft businesses in Germany present themselves online, using automated website audits and a transparent scoring model. It helps chambers, ministries, and researchers see where digital support is most needed.

A Turborepo monorepo for collecting, analysing, and publishing the **Handwerk Digital Readiness Index (HDRI)** — a longitudinal, signal-based assessment of how craft-industry businesses present themselves online.

## What this project does

The platform consists of three layers:

1. **Factory** ([`apps/hdri-factory`](apps/hdri-factory/README.md)) — harvests site catalogs from public directories (chambers of crafts, IHK, trade listings), checks liveness, crawls homepages, and runs Lighthouse and axe audits.
2. **Observatory** ([`apps/digital-observatory`](apps/digital-observatory/README.md)) — maps raw signals to an ontology, scores them with a configurable codebook, and builds privacy-safe data marts.
3. **Dashboard** ([`apps/hdri-dashboard`](apps/hdri-dashboard/README.md)) — a static Astro site that visualises the scored, anonymised data for public consumption.

Engineers and analysts can run the pipelines locally, inspect intermediate SQLite databases, and rebuild the dashboard after any scoring or codebook change.

## Methodology (high-level)

- HDRI uses signals from public business websites (availability, performance, accessibility, content).
- Each signal is mapped to an ontology (e.g. contactability, device readiness, accessibility).
- A transparent codebook assigns weights and thresholds for each signal.
- Scores are computed per business and aggregated per region or cohort.
- No personal data or individual business names are published in the public dashboard.

The complete scoring logic and weights are maintained in [`packages/hdri-codebook`](packages/hdri-codebook).

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
- [`apps/hdri-factory/RUNBOOK.md`](apps/hdri-factory/RUNBOOK.md) — Operational runbook for the factory pipeline chain
- [`METHODOLOGY.en.md`](METHODOLOGY.en.md) — Scientific methodology of the HDRI (weights, signals, sampling)
- [`GOVERNANCE.en.md`](GOVERNANCE.en.md) — Project governance and roles
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — Contributor Code of Conduct
- [`SECURITY.md`](SECURITY.md) — Privacy and security notes

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

## Contact and institutional use

Institutions (e.g. chambers of crafts, ministries, research organisations) interested in piloting HDRI, validating the methodology, or co-developing modules are invited to get in touch via GitHub issues or by contacting the Project Lead directly.

See [`CONTACT.en.md`](CONTACT.en.md) for collaboration paths and response times.

## Public mission

The **Handwerk Digital Readiness Index (HDRI)** is built as a public good.

**Scope and focus:**
- Target group: **craft businesses in Germany** (over one million businesses, roughly five million employees).
- Purpose: **benchmarking digital presence**, **identifying regional gaps in digital readiness**, and **tracking progress over time**.
- Use case: evidence-based policy advice and targeted digital-support programmes.

Germany's craft sector forms the backbone of the country's regional economies. Yet the digital presence of most Handwerk businesses remains understudied, fragmented, and difficult to assess at scale. HDRI exists to change that.

This platform is intentionally open: every pipeline, scoring rule, and codebook weight is version-controlled and auditable. Aggregated, anonymised quarterly data are published on **[handwerk-index.de](https://handwerk-index.de)**. Any researcher, chamber of commerce, ministry, or civic technologist can inspect how the index is constructed, challenge its assumptions, extend its methodology, or rerun its analysis on new data. Opacity has no place in a tool designed to inform public policy.

### Who this is for

- **Handwerkskammern and Kreishandwerkerschaften** - use HDRI data to benchmark member businesses, identify underserved regions, and prioritise digital-support programmes.
- **Federal and state ministries** (BMWK, Landeswirtschaftsministerien) - use the longitudinal dataset to track the impact of digitalisation funding and report evidence-based progress.
- **Research institutions** (ZEW, Fraunhofer IAO, university departments) - build on the anonymised cohort data and open codebook for comparative or sector-specific studies.
- **Civic technologists and journalists** - explore the public dashboard and underlying data to report on regional disparities in digital readiness.

### What "open" means here

The source code, pipeline logic, scoring engine, and all non-personal derived data are released under the **[Apache License 2.0](LICENSE)**. You may use, modify, and distribute them freely - for research, policy work, or commercial applications. Three lightweight obligations apply: retain the existing copyright and licence notices, mark any files you modify, and include the licence text when redistributing. No copyleft, no source-disclosure requirement, no registration. Patent rights are explicitly granted to all users under the same terms.

No registration, no API key, no fee. Fork it, adapt it, deploy it.

### How to get involved

Contributions are welcome at every level — from correcting a codebook weight to integrating a new data source or translating the dashboard into German. See [`CONTRIBUTING.en.md`](CONTRIBUTING.en.md) for the full guidelines.

- **Code or methodology** — read [`CONTRIBUTING.en.md`](CONTRIBUTING.en.md), then open an Issue or Pull Request
- **Partnership or press** — see [`CONTACT.en.md`](CONTACT.en.md) for collaboration paths and response times
- **Just start a conversation** — open a [GitHub Issue](https://github.com/syrokomskyi/hdri/issues)

> This project is maintained by an independent developer based in Backnang, Baden-Württemberg, Germany.
> Contact: [`CONTACT.en.md`](CONTACT.en.md) · [github.com/syrokomskyi](https://github.com/syrokomskyi)
