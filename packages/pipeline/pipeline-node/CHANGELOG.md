# Changelog

All notable changes to the `pipeline-node` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Generate and add CHANGELOG.md files to all packages and apps for improved version tracking and transparency.
- Add changelog links to all README.md files to provide easier navigation to release history.
- Add AGENTS.md files to all major packages and apps for agent documentation.

### Changed
- Migrate all uses of @webgogol/forge to @warpgogol/forge and implement RFC-0070 renaming @wgogol/changelog-live to @warpgogol/changelog-live for consistent package naming.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 to restore compatibility with typescript-eslint.

### Documentation
- Update all relevant documentation and skills to reference new package namespaces and document the addition of AGENTS.md and changelog links across the codebase.

## 2026-07-23 .. 2026-07-29

### Added
- Introduce mandatory AI model usage disclosure in pipeline guides as per RFC-0007.
- Restore missing package.json files and add a project README.
- Add AI model usage disclosure documentation (RFC-0007).

### Changed
- Upgrade dependencies across the workspace to latest versions.
- Consolidate pipeline-node barrel exports.
- Extract path logic into node-pipeline-paths.ts in pipeline-node.

### Fixed
- Add missing extracted modules following pipeline-node context split.
- Align all vitest versions and merge AGENTS.md for improved documentation consistency.

### Removed
- Remove all references to code-compass from devDependencies and scripts.
- Flatten project structure by moving apps/source/* to the repository root.

### Documentation
- Update project documentation inventory and narratives.

## 2026-07-09 .. 2026-07-15

### Added
- Implement axiom foundation phase with new pipeline apps, packages, and documentation.

### Changed
- Rename @org scope to @syrokomskyi across the entire monorepo, including all import paths, manifests, and documentation.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass and update all references accordingly.

### Fixed
- Resolve lint issues by ensuring eslint and supporting dependencies are present and correctly configured in all packages and apps, and updating scripts to invoke eslint binary via node.

### Removed
- Remove TStep generic from CreatePipelineEngineOptions.
- Remove redundant pipeline-node AI helpers and boilerplate utility modules by consolidating logic and extracting shared helpers.

### Security
- Normalize and tighten package.json formatting and dependency declarations during dependency upgrades.

### Documentation
- Update pipeline-node README and pipeline-apps rules to support shared CLI and registry factories.
- Add documentation for new and updated axiom packages and apps.

## 2026-07-02 .. 2026-07-08

### Added
- Add COMPASS scaffolding and root-level commands across all core packages to support the annotate command and enhance developer workflows.

### Changed
- Rename @org/compass-checks to @wgogol/compass and @wgogol/compass to @wgogol/code-compass throughout the project, and update relevant imports and manifests.

### Fixed
- Remove forbidden blocks from packages and scripts to comply with grace checks.

### Removed
- Deprecate and remove legacy compass-checks, compass-core, and compass-codegen modules and tests, consolidating functionality under the new @wgogol/compass structure.

## 2026-06-18 .. 2026-06-24

### Added
- Add prettier-plugin-astro to project dependencies for Astro file formatting.

### Changed
- Bump wrangler to version ^4.103.0, sharp to ^0.35.2, and prettier to ^3.8.4 across dashboard, inticle, site, video-loop, and pipeline-node packages.
- Reformat all source files for consistency.

### Fixed
- Correct minor formatting and typographic inconsistencies across documentation, prompts, and code.

### Removed
- Remove redundant or deprecated markdown and legal doc files from site and factory run directories.

### Security
- Update wrangler and sharp dependencies to address recent security advisories.

### Documentation
- Update and reformat project documentation for clarity and consistency.

## 2026-06-11 .. 2026-06-17

### Added
- Update multiple dependencies across apps and packages to improve performance, compatibility, and security.

### Changed
- Upgrade core libraries including better-sqlite3, astro, @anthropic-ai/sdk, openai, ai, semver, and sharp to the latest versions to benefit from feature improvements and bug fixes.

### Fixed
- Resolve potential issues arising from outdated package versions by synchronizing dependencies across all major components.

## 2026-05-07 .. 2026-05-13

### Added
- Centralize brief frontmatter merging in all hdri-factory phases using the new mergeBriefFrontmatter utility from @org/pipeline-node.

### Changed
- Refactor brief parsing and validation to remove manual spread operations and eliminate sharedSourceToken parameter passing in hdri-factory phases.
- Upgrade dependencies across multiple apps and packages to latest versions.

### Fixed
- Simplify and standardize shared brief validation to better handle optional root config.

### Removed
- Remove sharedSourceToken parameter from brief parsing functions as merge now occurs before parsing.

## 2026-04-30 .. 2026-05-06

### Added
- Translate all package README files to English, updating descriptions and usage information.

### Changed
- Convert inline comments in branche-mapping.ts from Russian to English.

### Documentation
- Update documentation to reflect translated and enhanced usage sections across multiple package READMEs.

## 2026-04-23 .. 2026-04-29

### Added
- Add new README documentation files for all packages and application modules.
- Add initial implementation for core pipeline, business, and site kernel modules covering rate limits, code generation, content management, checks, and deployment.
- Add new Gogol components for accessibility, analytics, client handoff, process guides, and more.

### Changed
- Update Gogol content modules to improve clarity and structure.
- Update site pipeline core and node utilities for improved robustness.

### Fixed
- Resolve build errors to ensure 'pnpm build' passes without issues.

### Removed
- Remove and archive the deprecated business-base application, including all related source code, pipelines, data, and documentation.

## 2026-04-16 .. 2026-04-22

### Added
- Add support for AbortSignal and finalUrl in fetch-helpers for improved fetch control and handling.
- Add Playwright dependency to business-base and pipeline-node.

### Changed
- Replace local Playwright fetch logic and fetchPageHtml implementations with shared fetchWithFallback from @org/pipeline-node for consistent fallback support.
- Suppress JSDOM CSS parsing errors using VirtualConsole for clearer logging.

### Fixed
- Remove redundant timeout, abort, and error handling utilities now covered by shared fetchWithFallback implementation.

### Removed
- Remove redundant baseUrl and ignoreDeprecations compiler options from app and package tsconfigs, relying on tsconfig.base.json inheritance.

## 2026-04-09 .. 2026-04-15

### Added
- Initial project structure, including all core packages and shared libraries for async operations, color processing, and utilities.
- Complete pipeline engine and step definitions enabling modular automation flows.
- Multiple AI integration modules (OpenAI, Anthropic, Perplexity) for advanced text and analysis tasks.
- Comprehensive markdown documentation, guides, and usage specifications covering phase and step-by-step instructions.
- Ready-to-use prompts and templates for AI-driven editorial, analysis, translation, and announcement workflows.
- Reference pipelines for Inticle and Site workflows, including case studies, brand assets, editorial production, and announcement packaging.
- End-to-end pipeline and application runners for both editorial content and web site pipelines.
- Localization and translation support for German, English, and Russian outputs in analyses, mind maps, and announcements.
- Full test setups, configuration, and utility scripts for streamlined development and deployment.

### Changed
- Adapt project from pipelines-webgogol-3, restructuring for improved modularity and reusability.

### Fixed
- Resolve initial import and structure inconsistencies from the upstream project during the clone process.

### Documentation
- Provide README and in-depth markdown documentation for each package and workflow.
- Document all pipeline steps, prompts, and AI interaction guides.
