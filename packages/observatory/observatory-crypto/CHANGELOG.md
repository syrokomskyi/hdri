# Changelog

All notable changes to the `observatory-crypto` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add generated CHANGELOG.md files for all packages and applications.
- Add initial AGENTS.md documentation files across all packages and applications for agent usage and capabilities.

### Changed
- Rename package scope from @wgogol/changelog-live to @warpgogol/changelog-live throughout the monorepo.
- Migrate forge package from @webgogol/forge to @warpgogol/forge.
- Update HDRI evidence closure contracts across relevant modules.
- Bump multiple dependencies including TypeScript, ESLint, commander, openai, anthropic, jsdom, @tanstack/table-core, @swc/core, @swc/helpers, cross-env, jiti, turbo, jose, tsx, typescript-eslint, csv-parse/stringify, undici, verdaccio, and @warpgogol/forge to latest compatible versions.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 to restore compatibility with typescript-eslint.
- Fix end-to-end verification of frozen quarter evidence in HDRI modules.
- Seal HDRI snapshots using derived public keys for improved cryptographic integrity.

### Documentation
- Update and standardize various AGENTS.md and SKILL.md documentation files.

## 2026-07-23 .. 2026-07-29

### Added
- Add missing package.json files, align vitest versions, and provide a new README.md and project-narrative.md.

### Changed
- Upgrade dependencies across the workspace for improved stability.
- Consolidate observatory-crypto auto-env into env.ts for clearer environment management.

### Fixed
- Restore previously missing package.json files to resolve build and environment issues.
- Merge AGENTS.md entries for improved consistency.

### Removed
- Remove all code-compass references from package.json devDependencies and scripts.
- Remove device.ts remnant from observatory-crypto.
- Flatten project structure by moving apps/source modules to the root and deleting redundant files, including legacy .codex skills and configuration files.

### Documentation
- Update AGENTS.md and docs/compass-inventory.xml for documentation consistency.

## 2026-07-09 .. 2026-07-15

### Added
- Add missing @org/source resolve conditions to Vitest configs across all affected packages.

### Changed
- Migrate all monorepo packages and apps from @org to @syrokomskyi scope for consistency.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass throughout the monorepo.
- Normalize package.json formatting across all applications and packages.
- Upgrade dependencies in multiple packages and apps, including Astro, tsx, typescript-eslint, and AWS SDK versions.
- Update all monorepo packages and apps to include eslint and related linting dependencies in devDependencies.
- Invoke eslint via node binary in all packages and apps for improved compatibility.

### Fixed
- Split device.ts into multiple modules and improve transparency and verification in the observatory-crypto package.

## 2026-07-02 .. 2026-07-08

### Added
- Add COMPASS scaffolding and root-level command support across all packages.
- Introduce COMPASS manifest, API, documentation, and test suites as package replacements for compass-checks, compass-codegen, and compass-core.

### Changed
- Rename @org/compass-checks to @wgogol/compass and update references throughout the codebase.
- Rename @wgogol/compass to @wgogol/code-compass, migrating all internal references and dependencies.
- Enable COMPASS integration for all packages, updating package manifests and build scripts.
- Apply prettier formatting to improve code style consistency in digital-observatory, city, and architecture manifests.

### Fixed
- Remove forbidden code blocks in packages and scripts to resolve grace violations.

### Removed
- Remove legacy compass-checks, compass-core, and compass-codegen packages in favor of the new consolidated COMPASS package.

## 2026-06-25 .. 2026-07-01

### Added
- Publish trusted-keys root and key-rotation ceremony artifacts
- Implement key registry functionality and tests for trusted-keys handling
- Add documentation for key rotation procedures

### Changed
- Update verify-vault logic to support trusted-keys root

## 2026-06-18 .. 2026-06-24

### Added
- Add missing 'localize-concept-image.md' to site prompts.

### Changed
- Reformat codebase and documentation files for consistent code style and improved readability across all major applications and packages.
- Format 'sign.ts' with double quotes and consistent spacing in observatory-crypto.

### Fixed
- Resolve minor documentation and content inconsistencies in prompts and markdown files.

### Removed
- Remove obsolete legal doc prompt files in site app.

### Security
- No security-related changes.

### Documentation
- Update and clarify README, AGENTS.md, and RUNBOOK files across apps and packages.

## 2026-06-11 .. 2026-06-17

### Changed
- Update dependencies: better-sqlite3 to 12.10.1, csv-stringify to 6.8.0, csv-parse to 7.0.0, vitest to 4.1.9, and @cloudflare/workers-types to 4.20260615.1 across multiple packages.

## 2026-06-04 .. 2026-06-10

### Added
- Update dependencies across all workspace packages to latest versions, including @types/node, tsx, vitest, astro, @astrojs/cloudflare, wrangler, @anthropic-ai/sdk, openai, @google/genai, tldts, and @duckdb/node-api.

### Changed
- Bump multiple package versions throughout the monorepo for improved stability and compatibility.

### Fixed
- Resolve potential issues from outdated dependencies by synchronizing all package versions.

## 2026-05-21 .. 2026-05-27

### Added
- Alphabetize digital-observatory workspace imports for improved organization.

### Changed
- Update dependencies to latest versions across multiple packages including @types/node, tsx, vitest, astro, @anthropic-ai/sdk, @google/genai, openai, and tldts.

### Fixed
- Resolve potential consistency issues by standardizing package versions and lockfile.

## 2026-05-07 .. 2026-05-13

### Added
- Add DER format auto-detection to loadSigningKeyFromEnv, enabling support for both PEM and raw PKCS8 DER key formats.
- Introduce canonicalize, verify, and sign utilities to observatory-crypto, and add new package observatory-vault with DuckDB reader/writer modules and supporting configuration.

### Changed
- Normalize sourceToken format to lowercase (yyyy-qn-cc[-extra]) in observatory-crypto, update all related documentation examples and error messages.
- Centralize transparency keys path resolution in VerifyUpstreamGogol by using getTransparencyKeysDir() from observatory-crypto and remove transparencyDir from config to reduce duplication.
- Upgrade project dependencies across all apps and packages.

### Fixed
- Correct parsing of device source tokens to accept both uppercase and lowercase quarter and country codes.

### Removed
- Remove IngestSelfReportsGogol logic and unused CSV, markdown, and report files from output data pipelines for multiple harvest and deduplicate steps, significantly cleaning up generated data artefacts.

### Documentation
- Update pipeline and project documentation throughout core and factory apps, including onboarding, process phases, and discovery guides.
