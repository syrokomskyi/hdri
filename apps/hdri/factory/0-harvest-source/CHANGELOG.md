# Changelog

All notable changes to the `0-harvest-source` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add changelog links to all README.md files across packages and apps
- Generate CHANGELOG.md files for all packages and apps
- Add changelog.config.yaml and changelog-live as a devDependency to all missing packages and apps

### Changed
- Regenerate all AGENTS.md files as part of RFC-0070 step 16

### Fixed
- Exclude test files from HDRI factory app tsconfigs to prevent build issues
- Remove files containing leaked AWS STS credentials to protect sensitive information

### Removed
- Remove files with leaked AWS STS credentials

### Security
- Remove files containing leaked AWS STS credentials for security compliance

### Documentation
- Update and add changelog references throughout documentation

## 2026-07-23 .. 2026-07-29

### Added
- Add missing package.json files to various apps, packages, and services.
- Add root README.md and merge AGENTS.md content.

### Changed
- Upgrade dependencies across the entire workspace.
- Align Vitest versions for package consistency.
- Flatten project structure by moving all apps/source contents to the repository root.

### Fixed
- Restore missing package.json files in multiple locations.

### Removed
- Remove code-compass from all devDependencies, scripts, and related package.json files.
- Remove legacy apps/source directory structure and outdated documentation files.

### Documentation
- Update documentation for agent integrations and restructure README/AGENTS information.
