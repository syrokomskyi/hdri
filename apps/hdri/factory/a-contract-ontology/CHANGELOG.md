# Changelog

All notable changes to the `a-contract-ontology` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add changelog configuration files and changelog-live as a development dependency to all missing packages and apps.

### Changed
- Update package.json files to include changelog-live and reference changelog.config.yaml where necessary.

### Fixed
- Correct pnpm-lock.yaml to synchronize new dependencies.

### Removed
- Remove redundant or outdated changelog configuration in package.json where replaced by changelog-live setup.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files across multiple packages and apps for workspace consistency.
- Add README.md and merge AGENTS.md improvements for better onboarding.

### Changed
- Upgrade dependencies throughout the workspace to ensure latest compatibility.
- Flatten project structure by moving contents of apps/source/* to the project root.
- Align Vitest versions across the workspace.

### Fixed
- Restore and align project configuration files to fix installation and build issues.

### Removed
- Remove code-compass from all package.json devDependencies and scripts.
- Delete legacy files and redundant source directory following project structure flattening.

### Documentation
- Merge AGENTS.md updates and add improved README.md for clearer documentation.
