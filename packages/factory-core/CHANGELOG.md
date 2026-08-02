# Changelog

All notable changes to the `factory-core` project are documented here.

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
