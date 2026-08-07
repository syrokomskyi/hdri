# Monorepo addendum for `pipelines-gogol-4`

Use this file only for repository-wide details that go beyond the scoped `AGENTS.md` hierarchy.

## Current reference points

- `apps/gen/site` is the current reference pipeline application for new pipeline scaffolding.
- `apps/gen/inticle` is an additional reference with feature-flag routing and multi-language translation (use it when the new app needs conditional phases or brief-driven route shaping).
- Legacy migrated snapshots under root `spec/**` must stay out of Turborepo task discovery and should remain excluded from workspace automation inputs.
- In git, `.input/` should keep only `.gitkeep` and safe examples or templates when appropriate.

## Monorepo AI instruction surfaces

- `AGENTS.md` files (root, `apps/`, `packages/`, `spec/`) define workspace-wide AI behavior.
- `.agents/rules/*` holds deep-dive rules referenced from root `AGENTS.md`.
- `.agents/prompts/*` holds reusable prompt templates.
- `.agents/architecture.manifest.json` is the machine-readable AEO contract for app classification, UI exceptions, forbidden pipeline dependencies, and required runtime conditions. Update it together with prose rules whenever architecture boundaries change.
- Keep app-specific architectural knowledge inside these files, not in nested app config folders or editor-specific config directories.

## Refactoring guidance

- If code is reused by multiple apps, move it from the app to `packages/*`.
- Keep pipeline-specific orchestration inside each app until there is a second real consumer.
- Do not keep app-local `gray-matter` caching/parsing helpers, declaration member-resolution helpers, template artifact idempotency helpers, manual OpenAI/Anthropic logging wrappers, or local validator combinators once shared helpers exist in `packages/*`.

## Migration tooling

- Migration workflow documented in `.agents/rules/migration-guide.md`

## Repository boundaries

- Do not create, edit, move, or delete files in `spec/**`.

## Development workflow

- Use `pnpm turbo run build --filter=@syrokomskyi/pipeline-core --filter=@syrokomskyi/pipeline-node --filter=@syrokomskyi/pipeline-ai --filter=@syrokomskyi/pipeline-steps` when you need a full shared runtime rebuild and want to avoid stale `dist` files causing runtime errors.
- If an app consumes additional shared packages or package subpaths at runtime, include every relevant shared package in the build pass; do not assume `pipeline-core`, `pipeline-node`, and `pipeline-ai` alone are sufficient forever.
- When adding a new pipeline app in `apps/*`, add its `tsconfig.json` to the root `tsconfig.json` `references` array when the repository uses TypeScript project references, and verify the workspace with the relevant root-level Turbo check tasks.
- All new workspace packages and apps must use the `@syrokomskyi/` npm scope. The `@org/` and `@wgogol/` scopes are retired; do not introduce them in new `package.json` files, imports, or scripts.
