# Changelog

All notable changes to the `hdri-codebook` project are documented here.

## 2026-07-09 .. 2026-07-15

### Added

- Add @org/source resolve conditions to all Vitest configuration files to ensure consistent module resolution.

### Changed

- Update all monorepo packages to use the @syrokomskyi scope instead of @org.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass.
- Upgrade dependencies across all packages and applications, including core libraries and development tools.
- Reformat various documentation and code files for improved readability and consistency.

### Fixed

- Move shebang to the first line in validate-signatories.ts for compatibility.
- Address ambiguous re-export, missing export, deduplication, and consistency issues in hdri-codebook.
- Deepen hdri-codebook architecture by introducing Zod-derived types, merging scoring rules, and enhancing governance validation.

### Removed

- Remove redundant or outdated exports and cleaned up type definitions in hdri-codebook.

### Documentation

- Update AGENTS.md, README files, and various guides to reflect recent architecture refactors and scope renaming.

## 2026-07-02 .. 2026-07-08

### Added

- Add COMPASS scaffolding and enable root-level COMPASS commands across all packages for standardized project annotation and automation.
- Add MODULE_CONTRACT and CHANGE_SUMMARY annotations to compass and hdri-codebook source files to improve module clarity and traceability.

### Changed

- Rename @org/compass-checks to @wgogol/compass and remove compass-checks, compass-codegen, and compass-core packages in favor of consolidated compass package.
- Rename @wgogol/compass to @wgogol/code-compass and update all references for consistency.

### Fixed

- Apply code formatting and minor quality improvements across digital-observatory, city, and architecture manifests.

### Removed

- Remove obsolete compass-checks, compass-codegen, and compass-core packages and migrate relevant files into the main compass package.

## 2026-06-18 .. 2026-06-24

### Added

- Add new geo features to germany-states.geo.json.

### Changed

- Reformat codebase for consistent styling across all applications and packages.
- Upgrade @types/node to ^26.0.0, Astro to ^6.4.8, and update AI SDK dependencies throughout the monorepo.

### Fixed

- Resolve minor typos and formatting issues in documentation and configuration files.

### Removed

- Remove obsolete markdown files related to outdated gogol and pipeline documentation.

### Security

- Update dependencies to include latest security patches as part of package updates.

### Documentation

- Update and synchronize README, AGENTS, and RUNBOOK files for enhanced project clarity.

## 2026-06-11 .. 2026-06-17

### Changed

- Update dependencies to latest versions across multiple packages, including better-sqlite3, csv-stringify, csv-parse, vitest, @cloudflare/workers-types, @types/node, astro, @anthropic-ai/sdk, @ai-sdk/anthropic, @ai-sdk/openai, ai, semver, and sharp, for improved stability and security.

## 2026-06-04 .. 2026-06-10

### Added

- Update dependencies across all workspace packages including @types/node to 25.9.2, tsx to 4.22.4, vitest to 4.1.8, astro to 6.4.4, @astrojs/cloudflare to 13.6.1, wrangler to 4.98.0, @anthropic-ai/sdk to 0.102.0, openai to 6.42.0, @google/genai to 2.8.0, tldts to 7.4.2, and @duckdb/node-api to 1.5.3-r.3.

### Changed

- Bump multiple package versions to provide the latest bug fixes, performance improvements, and compatibility updates.

### Fixed

- Address potential issues by updating outdated dependencies across workspace.

### Removed

- Remove deprecated dependency versions in favor of newer releases.

### Security

- Incorporate upstream security patches delivered with updated dependencies.

### Documentation

- Update lockfile to reflect latest package versions for consistency.

## 2026-05-21 .. 2026-05-27

### Added

- Add public export of operational codebook as JSON and introduce codebook navigation links to the dashboard and methodology pages for enhanced transparency.
- Add HDRI acronym expansion (Handwerk Digital Readiness Index) to codebook and ontology labels and technical documentation for clarity.
- Add new dimension 'accessibility_audit' with AXE indicators and missing-policy to the codebook, including support for the 'countClampInverse' scoring engine.

### Changed

- Replace median-based statistics with p50 and introduce p10/p90 percentiles in cohort aggregates and across dashboard exports; update rankings to use p75 percentile instead of median.
- Update dependencies (including @types/node, tsx, vitest, astro, @anthropic-ai/sdk, @google/genai, openai, tldts), and alphabetize workspace imports.
- Update test and data file references to use engine-test-fixture.yaml for consistency.

### Fixed

- Fix various test files to accurately reflect codebook and scoring logic changes.

### Removed

- Remove obsolete fixture codebooks to streamline test fixtures and assets.

### Documentation

- Clarify index name by expanding HDRI acronym throughout user-facing documentation and labels.

## 2026-05-14 .. 2026-05-20

### Changed

- Update multiple dependencies to latest versions, including @types/node, tsx, @anthropic-ai/sdk, @google/genai, @types/jsdom, openai, @ai-sdk/anthropic, @ai-sdk/openai, ai, vite, and markdown-table across all packages.
- Normalize workspace dependency order in several package.json files for consistency.

## 2026-05-07 .. 2026-05-13

### Added

- Add support for new fields and parsing logic in hdri-codebook module.
- Add ontology loading and schema support in observatory-core package.

### Changed

- Rename industry-index app and related files to hdri-factory.

### Fixed

- Improve cookie banner extraction and site scoring logic in business-crawler and hdri-codebook modules.

### Removed

- Remove legacy references to industry-index and update documentation accordingly.

### Security

- Update key dependencies in multiple packages to address potential security issues.

### Documentation

- Update and improve README, RUNBOOK, AGENTS, and pipeline documentation across several apps.

## 2026-04-30 .. 2026-05-06

### Added

- Translate all package README files and inline code comments from Russian to English to improve accessibility.

### Changed

- Upgrade dependencies across multiple packages and apps to latest versions.

### Fixed

- Update and correct README descriptions and usage sections in 10 package READMEs for better clarity.

### Documentation

- Convert README content and inline comments to English, standardizing documentation language.

## 2026-04-23 .. 2026-04-29

### Added

- Add README files to all packages and application modules to improve documentation.

### Changed

- Upgrade dependencies across multiple packages and modules.

### Documentation

- Add documentation for all packages and application modules.

## 2026-04-16 .. 2026-04-22

### Added

- Add governance documentation, IRR computation scripts, and GDPR compliance processes to elevate the project to a public indicator standard.
- Introduce self-report intake module with database, cryptography, HTML templates, and routing functionality.
- Implement k-anonymity enforcement, new migrations, and schema definitions across core and self-report data.
- Expand the scoring architecture with modular pipeline, cohort-building, signal collection, codebook loading, and site scoring functionality.
- Integrate tests, fixtures, and example data for codebook and scoring modules.

### Changed

- Update project and package configurations to support new features and modules.

### Fixed

- Correct minor issues in codebook fixture and registry handling.

### Documentation

- Enhance documentation for governance, scoring architecture, pipeline phases, and processing steps.
