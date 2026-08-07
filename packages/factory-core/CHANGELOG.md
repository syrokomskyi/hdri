# Changelog

All notable changes to the `factory-core` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add comprehensive test coverage for edge cases in the HDRI pipeline, including quarter audit coverage, brief and instrument plan validation, and execution crash boundaries.
- Introduce new contracts and ensure immutability for HDRI quarterly capsules, execution events, and source ledgers, including capsule sealing on release.
- Implement uniqueness guard for capsuleId and new quarter initialization tool according to RFC requirements.

### Changed
- Rename @wgogol/changelog-live to @warpgogol/changelog-live in all package.json files and documentation as per RFC-0070.
- Update dependency versions for TypeScript, tsx, better-sqlite3, csv-stringify, jsonc-eslint-parser, and other related libraries across the workspace.
- Update and generate CHANGELOG.md files across all packages and apps.
- Enhance HDRI evidence and publication logic, including release boundary verification, freeze and seal of quarterly execution targets, audit target identification, and legacy release flag.

### Fixed
- Downgrade TypeScript 7.0.2 to 6.0.3 to restore typescript-eslint compatibility.
- Address multiple HDRI pipeline issues affecting Q3 release and liveness evidence, fixing race conditions, retry idempotency, closure bugs, and enforcing immutability for capsules and ledgers.
- Add type guards and logic corrections for instrument plans and consistency guards.
- Ensure atomic publishing of lease claims and correct delegation for parsing and checking gaps.

### Removed
- Remove deprecated references and entries from documentation and sample files.

### Security
- Harden immutability and closure of evidence and ledgers to prevent forgery and race conditions.

### Documentation
- Update AGENTS.md and RFC documentation to match new contract structures and changelog package rename.
- Improve and expand documentation for test strategies, contract initialization, audits, and release processes.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files across all apps and packages to ensure build compatibility.
- Add README.md and merge AGENTS.md documentation.

### Changed
- Upgrade dependencies across the workspace to their latest versions.
- Flatten project structure by moving apps/source/* to the root directory for improved maintainability.

### Fixed
- Align vitest versions and resolve inconsistencies in package configurations.

### Removed
- Remove code-compass from all package.json devDependencies and scripts.
- Delete obsolete documentation and configuration from deprecated apps/source directory.

### Documentation
- Update and consolidate documentation including AGENTS.md and README.md.

## 2026-07-09 .. 2026-07-15

### Added
- Normalize package.json formatting across all apps and packages for consistency.

### Changed
- Rename internal package scopes from @org and @wgogol to @syrokomskyi across the entire codebase.
- Rename core app and package directories: hdri-factory to factory, digital-observatory to observatory, and hdri-dashboard to dashboard.
- Upgrade dependencies throughout all apps and packages, including Astro 7.0.9, tsx 4.23.1, typescript-eslint 8.64.0, systeminformation 5.31.17, @astrojs/cloudflare 14.1.3, @cloudflare/workers-types 5.20260714.1, and @aws-sdk/client-s3 3.1086.0.

### Fixed
- Normalize and update pnpm-lock.yaml to reflect new dependency versions and naming changes.

### Removed
- Remove old directory and package names and outdated references following renames.
