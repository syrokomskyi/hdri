# Changelog

All notable changes to the `5-audit-axe` project are documented here.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files across all apps and packages.
- Align all vitest versions for consistency and stability.
- Add top-level README.md for developer reference.

### Changed
- Upgrade dependencies across the entire workspace.
- Eliminate all pnpm install warnings for a cleaner install experience.

### Fixed
- Flatten project structure by moving apps/source/* to the repository root and adjusting related configuration files.

### Removed
- Remove all references to code-compass from devDependencies and scripts.
- Remove legacy apps/source directory structure and associated documentation and configuration files.

### Documentation
- Merge AGENTS.md content and update project narrative.
