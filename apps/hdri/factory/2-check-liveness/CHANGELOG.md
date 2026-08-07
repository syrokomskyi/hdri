# Changelog

All notable changes to the `2-check-liveness` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Add links to changelogs in all README.md files for apps and packages
- Generate CHANGELOG.md files for all apps and packages where missing
- Add changelog.config.yaml and changelog-live as a dev dependency to all relevant apps and packages

### Changed
- Regenerate and update AGENTS.md for all apps and packages per RFC-0070
- Bump major and minor versions of numerous dependencies across the workspace, including TypeScript, ESLint, Playwright, OpenAI, and related packages
- Update tsx, better-sqlite3, csv-stringify, and jsonc-eslint-parser to new versions

### Fixed
- Exclude test files from tsconfig in all HDRI factory apps

### Removed
- Remove deprecated or unused entries from CHANGELOG.md files across apps and packages

### Security
- Update dependencies to include latest security fixes for major packages

### Documentation
- Update documentation files such as brief.md, brief.example.md, and AGENTS.md in several HDRI and package directories

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files and add new README.md.

### Changed
- Upgrade dependencies across all workspace packages to latest versions.
- Align all Vitest versions for consistency across the monorepo.
- Flatten project structure by moving apps/source/* to the root directory.

### Fixed
- Restore missing metadata and configuration after project restructure.

### Removed
- Remove code-compass from all package.json devDependencies and scripts.
- Remove obsolete files and documentation from apps/source in favor of root structure.

### Documentation
- Merge AGENTS.md into the main documentation and update README.md content.
