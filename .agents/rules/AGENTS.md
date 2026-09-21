# Turborepo bridge guidance

- Use this file only for Turborepo-specific reminders that are not already covered by the scoped `AGENTS.md` hierarchy.
- When running tasks, prefer `pnpm turbo ...` from the monorepo root.
- Never guess Turborepo CLI flags. Check docs or `--help` first when unsure.

## Scaffolding & Generators

- For scaffolding tasks (creating apps, packages, project structure, setup), prefer the repository's existing generators and templates before introducing custom layout.

## When to use Turborepo docs

- USE for: advanced config options, unfamiliar flags, pipeline caching behavior, task graph configuration, and edge cases
- DON'T USE for: standard `pnpm turbo run ...` commands or things already defined by repository conventions
