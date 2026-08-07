# Changelog

All notable changes to the `business-crawler` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add AGENTS.md files to all packages and apps to document agents.
- Add changelog links to all README.md files across the project.
- Generate initial CHANGELOG.md files for all packages and apps.

### Changed
- Migrate @webgogol/forge to @warpgogol/forge and update relevant references.
- Rename @wgogol/changelog-live to @warpgogol/changelog-live in all affected files.
- Update multiple dependencies to their latest versions, including TypeScript 7.0.2, eslint 10.8.0, @playwright/test 1.62.1, commander 15.0.0, openai 7.4.0, @anthropic-ai/sdk 0.115.0, jsdom 30.0.1, write-file-atomic 8.0.0, @types/better-sqlite3 9.6.0, @tanstack/table-core 9.0.0, @swc/core 1.15.47, @swc/helpers 0.5.23, @swc-node/register 1.12.1, @warpgogol/forge 0.9.0, cross-env 10.1.0, jiti 2.7.0, and turbo 2.10.8.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 to ensure compatibility with typescript-eslint.
- Fix test issues related to SSL mock, stampSchemaMeta ordering, and DEVICE_ID environment variable in RFC-0042.

### Removed
- Remove registry_alias from business registry schema.

### Documentation
- Expand documentation for agent-related skills and principles across the agents folder.

## 2026-07-23 .. 2026-07-29

### Added
- Restore all missing package.json files across the workspace to ensure completeness.
- Align all package.json files to use the same compatible vitest version for consistency.
- Add a unified README file for project documentation.

### Changed
- Upgrade and update dependencies to their latest versions throughout the mono-repo.
- Refactor business-crawler extractors to use shared extractor factories for improved maintainability.

### Fixed
- Restore previously missing package.json files and resolve related lockfile inconsistencies for reliable builds.

### Removed
- Remove code-compass from all package.json devDependencies and scripts.
- Flatten project structure by moving apps/source/* contents to the repository root and delete obsolete files and folders related to the previous structure.

### Security
- Update dependencies as part of periodic upgrades, addressing potential known security vulnerabilities.

### Documentation
- Merge AGENTS.md updates and add new documentation for agents and project structure changes.

## 2026-07-09 .. 2026-07-15

### Added
- Add @org/source resolve conditions to all relevant Vitest configs for improved package resolution.

### Changed
- Rename all @org and @wgogol package scopes to @syrokomskyi across the monorepo to unify package naming.
- Update dependencies in all monorepo packages to their latest versions.
- Reformat source code and documentation for consistency and clarity.

### Fixed
- Fix Vitest resolve conditions to ensure @org/source imports work across all affected packages.

## 2026-07-02 .. 2026-07-08

### Added
- Add COMPASS package to each workspace and enable root-level commands.
- Add MODULE_CONTRACT and CHANGE_SUMMARY annotations to multiple configuration and source files.

### Changed
- Rename @org/compass-checks to @wgogol/compass and migrate code and test files accordingly.
- Rename @wgogol/compass to @wgogol/code-compass throughout all packages and adjust imports.
- Revert TypeScript file discovery to scan the specified root directory instead of the entire repository.
- Bump dependencies across all packages.

### Fixed
- Apply Prettier formatting and minor code quality improvements to digital-observatory, city, and architecture manifest.

### Removed
- Remove legacy @org/compass-checks, compass-codegen, and compass-core packages and associated files.

## 2026-06-25 .. 2026-07-01

### Added
- Add opt-in Impressum contact extraction feature, independent of HDRI pipeline.
- Add tests and documentation for Impressum contact extraction.

### Changed
- Update pipeline registry and business core to support new Impressum contact extraction.

### Documentation
- Document Impressum contact extraction process and usage.

## 2026-06-18 .. 2026-06-24

### Added
- Add new features, documentation files, and data entries across apps, packages, and scripts.

### Changed
- Reformat codebase and apply consistent formatting to source code, configuration files, documentation, prompts, and test files for improved readability and maintainability.
- Update AI SDK, Astro, Node types, and related dependencies to latest versions in all apps and packages.

### Fixed
- Correct minor typos, update test cases, and adjust file structures as part of reformatting.

### Removed
- Remove obsolete legal and phase documentation files as part of cleanup.

### Security
- Update dependencies to include latest security patches across all packages.

### Documentation
- Update and reformat all documentation, readme files, and methodological guides for clarity and consistency.

## 2026-06-11 .. 2026-06-17

### Changed
- Update multiple dependencies across packages, including better-sqlite3, csv-stringify, csv-parse, vitest, @cloudflare/workers-types, @types/node, astro, @anthropic-ai/sdk, @ai-sdk/anthropic, @ai-sdk/openai, ai, semver, and sharp, to improve security and compatibility.

## 2026-06-04 .. 2026-06-10

### Added
- Update multiple dependencies across all workspace packages, including @types/node 25.9.2, tsx 4.22.4, vitest 4.1.8, astro 6.4.4, @astrojs/cloudflare 13.6.1, wrangler 4.98.0, @anthropic-ai/sdk 0.102.0, openai 6.42.0, @google/genai 2.8.0, tldts 7.4.2, and @duckdb/node-api 1.5.3-r.3 for improved stability and compatibility.

### Changed
- Bump package versions to align with latest dependency updates.

### Fixed
- Resolve potential issues caused by outdated dependencies across monorepo.

## 2026-05-28 .. 2026-06-03

### Added
- Add TypeScript 6.0.3 as a devDependency to the business-crawler package to align with the monorepo-wide TypeScript upgrade.

### Changed
- Upgrade TypeScript to version 6.0.3 across the monorepo.

## 2026-05-21 .. 2026-05-27

### Added
- Alphabetize workspace imports in digital-observatory package.

### Changed
- Update dependencies across multiple packages, including @types/node to 25.9.1, tsx to 4.22.3, vitest to 4.1.7, astro to 6.3.7, @anthropic-ai/sdk to 0.98.0, @google/genai to 2.6.0, openai to 6.39.0, and tldts to 7.1.0.

### Fixed
- Update pnpm lockfile for consistency with latest dependencies.

## 2026-05-14 .. 2026-05-20

### Added
- Introduce domCacheSize configuration option with a default of 1000 and add domCache field to briefs for 3-extract-profile.

### Changed
- Migrate all 3-extract-profile extract gogols to use extractDom with shared DomCache, ensuring each page is parsed once and reused within cache capacity.
- Update dependencies, including @types/node, tsx, @anthropic-ai/sdk, @google/genai, @types/jsdom, openai, @ai-sdk/anthropic, @ai-sdk/openai, ai, vite, and markdown-table across all packages.
- Normalize workspace dependency order in package.json files for consistency.

### Fixed
- Resolve redundancy in DOM parsing for extract-profile by integrating context-based DomCache getOrLoad to share parsed pages across gogols.

## 2026-05-07 .. 2026-05-13

### Added
- Add new migration script and ontology loader utilities in observatory-core
- Add new type extensions and tests to hdri-codebook and observatory-core
- Add improved cookie banner extraction to business-crawler

### Changed
- Upgrade dependencies across core apps and packages, including observatory-core, hdri-factory, industry-index, and os/site-kernel modules

### Fixed
- Improve test fixtures and update score-site logic to handle additional cases in hdri-codebook

### Documentation
- Update pipeline and project documentation in digital-observatory and hdri-factory

## 2026-04-30 .. 2026-05-06

### Added
- Add extraction of copyright year from footer, body, and meta tags to site-profile pipeline with reporting in SummarizeProfileGogol.
- Add dedicated tables for impressum, datenschutz, opening hours, cookie banner, and copyright year extractions, splitting from monolithic extraction table.
- Add extraction and summarize phases to pipeline, and register new extraction gogols in the pipeline registry.
- Add vitest as a development dependency for business-crawler package.
- Add summaries and placeholder documentation for all extract gogols in the pipeline.

### Changed
- Bump PAGES_SCHEMA_VERSION to v2.0 and RULE_EXTRACTOR_VER to rule-v3, updating schema migration and extraction logic.

### Fixed
- Fix false positives in extractAwards and extractMemberships by using word boundaries to avoid improper keyword matches in compound words.
- Fix Schema.org type extraction to support deeply nested entities beyond @graph arrays.
- Fix regex escape in normalisePhone helper by removing unnecessary backslash before forward slash.

### Removed
- Refactor extract.ts into a lightweight barrel file, relocating extraction logic to dedicated src/extract/ modules for improved organization.

### Documentation
- Translate all package README files and code comments from Russian to English.
- Add and update documentation for new pipeline phases and individual extract gogols.

## 2026-04-23 .. 2026-04-29

### Added
- Add README files to all packages and application modules to improve documentation.

### Changed
- Upgrade dependencies across multiple packages and applications to the latest versions.

### Documentation
- Document all packages and modules with new README files.

## 2026-04-16 .. 2026-04-22

### Added
- Introduce governance documentation and advisory board member profiles to establish project oversight.
- Implement k-anonymity enforcement, self-report ingestion, and DSGVO compliance to enhance data governance and privacy.
- Add inter-rater reliability (IRR) computation and manual review sampling tools to scoring module.
- Launch site-profile application for structured crawling, extraction, summarization, and profile database setup with dedicated Gogol pipeline stages.
- Introduce site-liveness application to automate site checks, summarize liveness, and manage liveness database with new pipeline stages.
- Expand business-core to support migrations and schemas for self-reports, scores, and liveness data.
- Develop initial business-crawler utilities for batch processing, site extraction, liveness checks, and honoring robots.txt.
- Integrate script for codebook signatory validation and add fixture data in hdri-codebook package.

### Changed
- Update package manifests and configuration files across multiple apps and packages for new features and dependencies.

### Fixed
- Resolve minor inconsistencies in schema and fixture files for accuracy and data integrity.

### Documentation
- Document new pipeline stages, application flows, and processing steps in English-language markdown for all major modules.
