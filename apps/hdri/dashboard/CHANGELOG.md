# Changelog

All notable changes to the `dashboard` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add CHANGELOG.md files for all packages and apps to provide package-specific changelogs.
- Add links to changelogs in all README.md files for improved documentation navigation.

### Changed
- Rename package @wgogol/changelog-live to @warpgogol/changelog-live throughout the repository to comply with RFC-0070.
- Update dependency versions across the workspace, including TypeScript, ESLint, Playwright, Commander, OpenAI, Anthropic AI SDK, jsdom, write-file-atomic, @types/better-sqlite3, @tanstack/table-core, @swc/core, @swc/helpers, @swc-node/register, @warpgogol/forge, cross-env, jiti, turbo, tsx, better-sqlite3, csv-stringify, jsonc-eslint-parser, @types/pg, @cloudflare/workers-types, terser, @aws-sdk/client-s3, yaml, jose, typescript-eslint, csv-parse, undici, verdaccio, wrangler, vite, tldts, @google/genai, and others for improved stability and features.
- Implement a smart upgrade-packages script that pins major versions when upgrading package dependencies.
- Rebuild dashboard static assets to reflect the latest datasets and manifest changes.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 to restore compatibility with typescript-eslint.
- Downgrade @tanstack/table-core from 9.0.0 to 8.21.3 to resolve compatibility issues.
- Migrate Matomo tag manager integration on the dashboard to address analytics tracking.

### Documentation
- Update all README.md files to reference appropriate changelog files, improving documentation consistency.

## 2026-07-23 .. 2026-07-29

### Added
- Add missing package.json files to various apps and packages
- Add merged AGENTS.md and initial README documentation for improved onboarding

### Changed
- Upgrade dependencies across the workspace for better compatibility
- Flatten project structure by moving apps/source/* contents to the root
- Align Vitest versions across packages for consistency

### Fixed
- Restore essential files and references after project restructuring

### Removed
- Remove legacy project files, documentation, and redundant .codex skills
- Remove old apps/source/ structure and obsolete package artifacts

### Documentation
- Merge AGENTS.md content and add initial README.md for improved project documentation

## 2026-07-09 .. 2026-07-15

### Added
- Add Matomo analytics to the dashboard with privacy-first configuration and options for browser feature detection and opt-out toggle.
- Add a Changelog link with entry count to the footer.
- Add a CSS marker for all external links targeting \_blank.
- Integrate @tanstack/table-core for improved sortable tables in the dashboard.
- Add @syrokomskyi/changelog-live package and integrate it into the HDRI export process.

### Changed
- Move changelog configuration to per-project YAML and add a prebuild hook for changelog-live.
- Refactor table sorting to replace dual arrows with a single rotating arrow for clarity.

### Fixed
- Prevent table sorting from being triggered when clicking term-info markers in table headers.
- Correct table sorting logic and update sortable table styles for consistency.

### Removed
- Remove redundant Matomo TypeScript global declaration and mark Matomo script as inline.

## 2026-07-02 .. 2026-07-08

### Added
- Add MODULE_CONTRACT and CHANGE_SUMMARY annotations to configuration and source files for improved traceability.

### Changed
- Rename @org/compass-checks to @wgogol/compass and update all references and packages accordingly.
- Apply Prettier formatting across digital-observatory, city, and architecture manifest files.
- Move brand-inticle implementation from apps/inticle and apps/site to the new shared @org/brand-inticle package and update dependencies.
- Bump dependencies across all packages to latest versions.
- Apply secondary sort to hdri-dashboard 2026-q2 bundeslaender and matrix data for improved ordering.

### Fixed
- Update test suites and tools to match latest package and logic changes.

### Removed
- Remove legacy brand-inticle implementation from apps/inticle and apps/site.

### Security
- Update dependencies to address potential security vulnerabilities.

### Documentation
- Update digital-observatory documentation and architecture manifest for alignment with latest changes.

## 2026-06-25 .. 2026-07-01

### Added
- Surface the WP15 methodology changelog on the Methodik page of the dashboard.
- Enrich schema.org metadata and provide a dynamic homepage description for enhanced searchability and relevance.
- Introduce additive statistical rigor for cross-quarter trends in the Observatory (WP4).
- Implement cross-quarter comparison integrity guards in the Observatory (WP3).

### Changed
- Refactor dashboard homepage code by relocating pageDescription after helper functions.

### Fixed
- Update various Observatory and dashboard manifest and trends data to align with new analytical and integrity features.

### Documentation
- Update methodology documentation to reflect new observatory statistical rigor.

## 2026-06-18 .. 2026-06-24

### Added
- Add prettier-plugin-astro for enhanced Astro file formatting.

### Changed
- Update dependencies across the monorepo, including major bumps for @types/node, astro, wrangler, sharp, prettier, @cloudflare/workers-types, semver, and uuid.
- Reformat source files, documentation, and prompts for consistency and improved readability.
- Improve and format files arrays in package manifests.
- Enhance Astro and component file formatting with consistent tag placement and style.

### Fixed
- Fix and improve layout and formatting on dashboard index page.

### Removed
- Remove redundant documentation entries for obsolete site legal docs.

### Documentation
- Update and reformat README, AGENTS, and other project documentation for clarity and alignment with new tooling.

## 2026-06-11 .. 2026-06-17

### Added
- Update multiple dependencies across the codebase, including better-sqlite3, astro, @anthropic-ai/sdk, openai, playwright, @cloudflare/workers-types, wrangler, ai, tldts, @quantco/pnpm-licenses, csv-stringify, csv-parse, vitest, @types/node, lighthouse, and sharp.

### Changed
- Remove slice limits on dashboard data arrays to display all Bundesländer, Gewerke, and Matrix items, showing complete datasets instead of top entries.

### Fixed
- Ensure compatibility and resolve potential issues by upgrading to newer dependency versions.

### Removed
- Remove slice limits from trend items in dashboard to provide complete data.

### Security
- Update dependencies to incorporate the latest security patches.

### Documentation
- Update package versions in documentation to reflect dependency upgrades.

## 2026-06-04 .. 2026-06-10

### Added
- Add YAML frontmatter to auth.md documenting public read-only agent authentication settings.
- Add Agent Readiness features to hdri-dashboard, including Link headers (api-catalog, service-doc, service-desc, describedby), webmcp.ts script, service configuration metadata, and meta-card data attributes.

### Changed
- Upgrade dependencies across workspace packages, including astro, @astrojs/cloudflare, wrangler, @cloudflare/workers-types, ai, semver, @types/node, tsx, vitest, @anthropic-ai/sdk, openai, @google/genai, tldts, @duckdb/node-api, and others.
- Replace CSS custom property --layer-schema with hardcoded blue color values for backgrounds, outlines, and box-shadows in term.css.
- Update favicon.svg for hdri-dashboard app.

### Fixed
- Document DNS-AID configuration with SVCB record example and clarify DNSSEC requirement in the hdri-dashboard README.

## 2026-05-28 .. 2026-06-03

### Added
- Add DOI link to footer navigation for direct access to Zenodo dataset.
- Add StatisticalPopulation and variableMeasured schemas to homepage, providing detailed sample characteristics and maturity band counts as structured data.
- Add BreadcrumbList schema to Breadcrumbs and enhance glossary DefinedTerm schema with long descriptions, URLs, term set references, and alias codes for improved structured data.
- Add SoftwareSourceCode, DataDownload, and TechArticle schemas to codebook page and SoftwareSourceCode schema to methodology page, including repository metadata and download links with license details.
- Add 18 new FAQ entries detailing HDRI methodology, data sources, scoring, privacy, and statistics.
- Add maturity band classification table with collapsible details and semantic bar visualization based on score thresholds to dashboard and methodology pages.
- Add Open Graph and Twitter Card image metadata and sitemap enhancements for better social sharing and discoverability.
- Add KaTeX dependency and render scoring formulas with LaTeX math notation on methodology page; add mobile scrolling and sizing for formula blocks.
- Add glossary entries for Handwerksordnung (HWO) and Gewerk classification, linking to official references.

### Changed
- Update favicon.svg with new icon design.
- Change Schema.org publisher from Organization to Person type across all pages and correct spelling in Dataset schema.
- Change homepage Dataset schema license to Apache 2.0 to match project licensing.
- Merge Vorbild band into Fortgeschritten in MaturityBar for clearer maturity visualization.
- Update manifest timestamps from regenerated data bundles and improve tooltip positioning and heading levels for accessibility and clarity.
- Refactor dashboard layout and visualization logic, and update button backgrounds and grid layout for improved accessibility and appearance.

### Fixed
- Normalize term popover text alignment and font sizing for consistent appearance across contexts.
- Add tabindex for accessibility to tables and formula containers; address issues with tooltip placement, glossary schema completeness, and responsive design.

### Removed
- Remove detailed maturity band footnote text for simplicity and clarity.

### Documentation
- Update documentation to include Schema.org structured data section, methodology links, publication references, and bidirectional language navigation; translate and align documentation with the target audience and update publication domains to handwerk-index.de.

## 2026-05-21 .. 2026-05-27

### Added
- Add hdri-dashboard app as a monorepo workspace with initial data export and configuration scripts, registering it within build and dependency pipelines.
- Add wrangler config, initial version field, and start/deployment scripts for Cloudflare Pages support in hdri-dashboard.
- Implement breadcrumb navigation, codebook navigation links, hero section buttons, and two-level paths on codebook and methodology pages for improved UX.
- Switch codebook export from JSON to YAML format, reformat documentation notes with semantic version entries, and update dashboard to parse YAML directly at build time.
- Add JavaScript-driven tooltips with viewport clamping to improve detail presentation and prevent overflow clipping in accent layers.
- Provide enriched Gewerk table with group code–description labels via destatis-mapping lookup in all relevant table cells and expandable details sections on the dashboard.
- Introduce badge hyperlinks for all codebook version references to centralize documentation navigation via the /codebook page.
- Add percentile-based cohort aggregates (p10, p50, p75, p90), standard deviation, reliability classification, and visual indicators such as IQR bars, provenance badges, and expanded methodology documentation including statistical interpretation, FAQ, and detailed explanations of percentile/numeric approaches.
- Support German locale formatting throughout dashboard number/date helpers (score, count, formatDate) for consistent and locale-aware UI presentation.
- Add 1M+ row remediation report CSV with accessibility, performance, and security recommendations for digital asset observatory, covering key metrics and optimization opportunities.
- Add HDRI acronym expansion (Handwerk Digital Readiness Index) to codebook, ontology, and documentation for clarity on index name in all user-facing locations.

### Changed
- Replace deprecated median with p50, add p10/p90 to all aggregates, and re-sort dashboard/cohort tables using p75 for improved ranking accuracy and statistical modeling.
- Centralize dashboard card, table, and section styles using semantic CSS classes for accents, value formatting, and layout, removing inline styles for maintainability.
- Update tooltip UX and visual details: increase padding and font size, introduce monospace for alignment, add arrow indicator, refine animation, and prevent clipping by removing overflow constraints.
- Improve codebook changelog formatting: use structured version entries with semantic tags, monospace badges, and clear paragraph breaks for better readability.
- Update download links, YAML export/file naming, and .gitignore patterns for dynamically generated codebook assets and multi-version support.
- Upgrade dependencies in hdri-dashboard, digital-observatory, and related packages to latest versions for improved performance and security.
- Clarify data source description on dashboard to highlight use of publicly accessible sources rather than internal references.

### Fixed
- Fix runtime errors in matrix comparison fallback objects by ensuring suppression reasons, previous period, and status fields are present.
- Correct optional chaining and property fallback usage in dashboard index implementation to prevent undefined access bugs.
- Fix resync behavior in observatory pipeline by updating synced_bundles schema to use composite primary key and revising automation checks for multiple reference support.

### Removed
- Remove obsolete fixture codebooks, static JSON/YAML exports, and 1M+ row remediation CSV from version control as these should be dynamically generated and not tracked.
- Remove obsolete Semantic Content Stack visualization and all associated CSS/styles from dashboard hero section for a cleaner interface.
- Delete Astro-generated type definitions from hdri-dashboard to clean up auto-generated build artifacts.

### Security
- Remove static storage of large, sensitive CSVs and codebook data from repository, relying only on dynamically generated assets to minimize the risk of unintentionally exposing sensitive or outdated information.

### Documentation
- Update README and documentation across digital-observatory, hdri-dashboard, hdri-factory, and hdri-codebook to reflect HDRI acronym, codebook export workflow, and three-step regeneration process; update pipeline and changelog docs for data/statistics modeling changes, statistical interpretation, and methodology expansion.
