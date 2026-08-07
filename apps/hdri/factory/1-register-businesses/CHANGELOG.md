# Changelog

All notable changes to the `1-register-businesses` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Generate and add CHANGELOG.md files for all packages and apps to enable transparent changelog tracking.
- Add changelog.config.yaml configuration files and changelog-live as a devDependency to all previously missing packages and apps.
- Add changelog links to all README.md files for improved discoverability.
- Create test scripts and vitest config files for various HDRI factory sub-apps based on RFC-0042.
- Add multiple AGENTS.md files describing agent roles and behaviors across apps and packages.

### Changed
- Bump wide range of dependencies across all apps and packages, including typescript, eslint, tsx, csv-stringify, better-sqlite3, commander, openai, forge, and others for improved compatibility and security.
- Update AGENTS.md content throughout apps and packages in accordance with RFC-0070, including regeneration and added details.
- Update HDRI registry site management to preserve site identities during registry merging logic.
- Export additional functions and types and remove unused registry_alias in HDRI factory 1-register-businesses, 5-audit-axe, and related modules.

### Fixed
- Exclude test files from all HDRI factory application tsconfig.json files to prevent accidental inclusion during builds.
- Fix missing TypeScript project references and switch to tsc -b in 1-register-businesses and 4-audit-lighthouse HDRI factory sub-apps.

### Removed
- Remove obsolete fields from db schemas and registry_alias from HDRI factory codebase as part of refactoring.

### Documentation
- Update and regenerate AGENTS.md and README.md documentation, including links and new sections to reflect recent agent and package updates.
- Enhance documentation for HDRI factory and observatory apps, RUNBOOK, and .input/brief examples in alignment with RFC-0043.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files across multiple apps and packages.
- Add README.md and merge AGENTS.md documentation to root.
- Add project-narrative.md for project context.

### Changed
- Upgrade dependencies across the entire workspace to latest versions.

### Fixed
- Align all vitest versions for consistency throughout packages.

### Removed
- Remove code-compass from all devDependencies and scripts.
- Flatten project structure by moving apps/source/* to the repository root and deleting old source files and documentation.

### Documentation
- Update and reorganize major documentation files for clarity.
