# Changelog

All notable changes to the `utils` project are documented here.

## 2026-07-09 .. 2026-07-15

### Added

- Implement architectural review candidates in business-core, including new schema fields, migration logic, and core exports.

### Changed

- Rename all packages and references from @org to @syrokomskyi scope across the monorepo.
- Rename package @wgogol/code-compass to @syrokomskyi/code-compass in all relevant files.
- Upgrade dependencies and normalize package.json formatting across all packages and apps.
- Bump core dependencies across packages and apps, including Astro, tsx, typescript-eslint, systeminformation, @astrojs/cloudflare, @cloudflare/workers-types, and @aws-sdk/client-s3.

### Fixed

- Add eslint, @eslint/js, and typescript-eslint to devDependencies in all packages and apps to improve lint setup.
- Invoke eslint binary directly via node for reliable lint script execution in all packages and apps.

## 2026-07-02 .. 2026-07-08

### Added

- Add COMPASS package to monorepo and enable root-level CLI commands
- Annotate multiple packages with COMPASS scaffolding for improved consistency and automation

### Changed

- Rename @org/compass-checks to @wgogol/compass and update all references
- Rename @wgogol/compass to @wgogol/code-compass across applications and packages

### Fixed

- Remove deprecated compass-checks, compass-core, and compass-codegen packages following consolidation

### Removed

- Remove outdated files from compass-checks, compass-core, and compass-codegen packages

### Documentation

- Update README and related documentation to reflect new Compass package structure and naming

## 2026-06-18 .. 2026-06-24

### Added

- Add new geo data entries for Germany states in the HDri Dashboard.
- Add README files for async, colors, strings, and utils packages.

### Changed

- Reformat code and documentation across all apps and packages to improve consistency and readability.
- Update and unify prompts and template files across codebase for clarity and consistency.
- Update and standardize TypeScript configuration and build files across projects.
- Synchronize package versions and dependency declarations in all package.json files.
- Refine and standardize naming of pipeline and processing modules across all projects.

### Fixed

- Fix minor typos and formatting issues in various documentation and prompt files.

### Removed

- Remove redundant markdown documentation files from HDri Factory and Site modules.

### Security

- Update dependencies across all packages to address security advisories.

### Documentation

- Revise and clarify documentation in README, methodology, and governance files.
- Improve code and API documentation for core modules and shared packages.

## 2026-05-28 .. 2026-06-03

### Added

- Document HDRI Analysis Platform architecture in root README.md.

### Changed

- Translate German documentation to English in various READMEs.
- Update READMEs to use factory/observatory/dashboard terminology and remove obsolete migration guide links.

### Fixed

- Correct cross-references and outdated pipeline references in documentation.

### Removed

- Remove legacy pipeline and migration guide references from documentation.

### Documentation

- Revise and unify documentation across root and app/package READMEs.

## 2026-05-14 .. 2026-05-20

### Added

- Ensure logProgress always logs final progress at 100% completion, even when total is not a multiple of the interval.

### Changed

- Refactor logProgress output logic for more concise and unified handling.

### Fixed

- Add newline after final single-line progress output to prevent cursor remaining on the same line after completion.

## 2026-05-07 .. 2026-05-13

### Added

- Add singleLine parameter to logProgress utility to enable overwriting progress output in the terminal and reduce console clutter during classification.

### Changed

- Refactor logProgress utility: move to centralized @org/utils package and update all gogols to import it from the shared location instead of local utils files.

### Fixed

- Update all relevant gogol scripts to use the refactored logProgress utility from the new shared location.

### Removed

- Remove obsolete local progress logging implementations from individual utils files.

## 2026-04-16 .. 2026-04-22

### Added

- Update new-pipeline-app template to align with revised tsconfig settings.

### Changed

- Remove redundant baseUrl and ignoreDeprecations from app and package tsconfigs to rely on tsconfig.base.json inheritance.

## 2026-04-09 .. 2026-04-15

### Added

- Initialize codebase cloned from pipelines-webgogol-3, including all core application, pipeline, and utility packages.
- Add comprehensive documentation and process guides for agent rules, pipelines, and project operation.
- Add prompt, template, and configuration files for content generation, validation, translation, and audit workflows.
- Introduce source asset directories, test data, and example case studies for pipeline demonstration.
- Provide initial CI configuration, monorepo settings, and workspace setup for development.

### Changed

- Rebrand and adapt all references and assets for the new project context.

### Fixed

- Resolve broken references and streamline initial imports and documentation links.

### Removed

-

### Security

-

### Documentation

-
