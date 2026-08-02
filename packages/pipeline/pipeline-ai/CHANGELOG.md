# Changelog

All notable changes to the `pipeline-ai` project are documented here.

## 2026-07-09 .. 2026-07-15

### Added

- Add eslint, @eslint/js, and typescript-eslint to devDependencies in all apps and packages to ensure consistent linting.
- Add @org/source resolve conditions in vitest configs for proper module resolution.

### Changed

- Rename @org scope to @syrokomskyi throughout the entire monorepo, updating all references across packages, data, configuration, and documentation.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass in all relevant files.
- Upgrade dependencies across all packages and apps, including Astro, tsx, typescript-eslint, and SDK clients.
- Normalize package.json formatting and script usage across all packages and apps for consistency.

### Fixed

- Resolve wg-review findings by extracting shared logging, fixing broken imports, and updating CHANGE_SUMMARY in relevant packages.
- Fix lint script to invoke eslint binary directly via node for reliability.
- Consolidate AI helpers and context creation in pipeline packages to reduce duplication and improve maintainability.

### Removed

- Remove unused ai-helper, fs, paths, and logger utilities from pipeline-node to streamline codebase.

### Security

- Update dependencies—including systeminformation and SDKs—for latest security patches.

### Documentation

- Update AGENTS.md, README.md, pipeline docs, and methodology changelogs to reflect package renames, scope updates, and normalized structure.

## 2026-07-02 .. 2026-07-08

### Added

- Add COMPASS scaffolding and enable COMPASS root-level commands across all core packages for workflow consistency.

### Changed

- Rename @org/compass-checks to @wgogol/compass, move code to new package location, and update all dependencies to use the new package name.
- Rename @wgogol/compass to @wgogol/code-compass and update all dependent packages accordingly.
- Update dependencies and configuration across packages to support new COMPASS integrations and maintain compatibility.

### Fixed

- Apply Prettier formatting to digital-observatory, city, and architecture manifest; fix minor formatting and consistency issues in various scripts and package files.

### Removed

- Remove legacy @org/compass-checks and related unused packages after migration to @wgogol/compass.

## 2026-06-18 .. 2026-06-24

### Added

- Add missing documentation files to packages and apps.

### Changed

- Reformat source code across all packages and applications for improved readability and consistency.
- Update @types/node to ^26.0.0, Astro to ^6.4.8, and AI SDK package versions across the monorepo.

### Fixed

- Correct minor typos and inconsistencies in prompts, READMEs, and pipeline definitions.

### Removed

- Remove deprecated pipeline documentation and legacy code references.

### Security

- Apply latest package updates and AI SDK improvements to ensure dependency security.

### Documentation

- Update and synchronize documentation to reflect new formatting and dependency versions throughout the monorepo.

## 2026-06-11 .. 2026-06-17

### Added

- Update dependencies across multiple packages, including upgrades to @anthropic-ai/sdk, astro, openai, playwright, ai, tldts, semver, sharp, and other related packages.

### Changed

- Improve reliability and security by adopting newer dependency versions, ensuring compatibility and enhanced performance across the project.

### Fixed

- Resolve minor issues introduced by outdated package versions.

## 2026-06-04 .. 2026-06-10

### Added

- Make the temperature parameter in the Anthropic API client optional, defaulting to the model's default value.

### Changed

- Update all workspace package dependencies to their latest versions as of June 2026.
- Remove temperature parameter from all Inticle Gogol classes for consistency.

## 2026-05-28 .. 2026-06-03

### Added

- Add .env.example files to multiple apps and packages to support environment variable management and export.

### Changed

- Upgrade dependencies across several apps and packages to latest versions.

## 2026-05-21 .. 2026-05-27

### Added

- Alphabetize workspace imports in digital-observatory for improved consistency.

### Changed

- Upgrade and update multiple dependencies across apps and packages, including @anthropic-ai/sdk, @astrojs/cloudflare, astro, @duckdb/node-api, @quantco/pnpm-licenses, wrangler, @types/node, tsx, vitest, @google/genai, openai, and tldts.

### Fixed

- Harmonize dependency versions to enhance compatibility throughout the monorepo.

### Removed

- Remove unused and redundant dependency entries from package manifests.

### Security

- Address potential security issues by updating packages to the latest secure versions.

### Documentation

- Update lockfile and package manifests to reflect current dependency versions.

## 2026-05-14 .. 2026-05-20

### Added

- Update multiple dependencies across all packages, including @types/node, tsx, @anthropic-ai/sdk, @google/genai, @types/jsdom, openai, @ai-sdk/anthropic, @ai-sdk/openai, ai, vite, and markdown-table, to their latest versions.

### Changed

- Normalize workspace dependency order in several package.json files for consistency.

## 2026-05-07 .. 2026-05-13

### Added

- Update multiple dependencies across apps and packages to the latest versions for performance and stability improvements.

### Changed

- Replace nullish coalescing operator with logical OR for userText fallback in createOpenAiText function.

## 2026-04-30 .. 2026-05-06

### Added

- Translate all package README files from Russian to English, including descriptions and usage sections, and convert inline comments in branche-mapping.ts to English.

### Changed

- Upgrade project dependencies across multiple packages for improved stability and compatibility.

## 2026-04-23 .. 2026-04-29

### Added

- Add README documentation to all packages and application modules.

### Changed

- Upgrade openai to 6.35.0 and jsdom to 29.1.0 in core packages.
- Bump various dependencies and transitive dependencies across all packages.

### Documentation

- Add comprehensive README files to enhance package documentation.

## 2026-04-16 .. 2026-04-22

### Added

- Update new-pipeline-app template to inherit base compiler settings from tsconfig.base.json.

### Changed

- Remove redundant baseUrl and ignoreDeprecations from all tsconfig files to enforce inheritance from tsconfig.base.json.

### Removed

- Remove explicit baseUrl and ignoreDeprecations from app and package tsconfigs.

### Documentation

- Update documentation to reflect tsconfig changes and base config inheritance.

## 2026-04-09 .. 2026-04-15

### Added

- Add initial project codebase cloned from pipelines-webgogol-3, including all core application files, configuration, and assets.
- Introduce new pipeline modules, processors, and templates for both inticle-webgogol-3 and site-webgogol-3 applications.
- Provide comprehensive documentation, guides, prompts, and sample data covering all phases and steps of the pipeline.
- Implement core packages: async, colors, pipeline-core, pipeline-node, pipeline-steps, strings, and utils with full TypeScript support.
- Add automation scripts, workflows, and continuous integration setup for ease of development and deployment.

### Changed

- Refactor file structure and naming conventions to establish a modular monorepo architecture with clear package and app boundaries.

### Fixed

- Address initial setup and compatibility issues related to template rendering and configuration across new apps and packages.

### Removed

-

### Security

-

### Documentation

- Add extensive markdown guides, AGENTS, and README files for both new and legacy processes, including purpose, operational guides, and migration plans.
