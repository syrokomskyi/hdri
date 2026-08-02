# Changelog maintenance rules

## When to update changelogs

- **After completing a feature, fix, or significant change** in any `apps/*` or `packages/*` workspace that has a `changelog.config.yaml`, run `pnpm changelog` from the monorepo root to generate updated CHANGELOG entries.
- Changelogs are **AI-generated** from git commit history — do not manually edit `CHANGELOG.md` or `CHANGELOG_PUBLIC.md` files. The tool reads git commits, groups them by completed week, and sends to an LLM for professional formatting.
- Only **completed weeks** are written. In-progress (current) weeks are never included. Re-running on the same week is idempotent.
- Run changelog generation **before committing** if you want the changelog update in the same commit, or as a separate follow-up commit.

## How to run

### All workspaces at once (preferred)

```bash
# Generate changelogs across ALL projects in the monorepo
pnpm changelog

# Initialize changelog.config.yaml in a project that doesn't have one yet
pnpm changelog:init
```

Both commands run through Turborepo (`pnpm turbo run changelog` / `changelog:init`), executing in parallel across all workspaces that have the scripts defined.

### Single workspace

```bash
# Generate changelog for one project
pnpm --filter @syrokomskyi/<package> run changelog

# Initialize config for one project
pnpm --filter @syrokomskyi/<package> run changelog:init
```

### Projects without package.json scripts

Some `changelog.config.yaml` files live in directories that are not npm workspaces (e.g. `apps/hdri/`). For these, run the CLI directly:

```bash
# From the directory containing changelog.config.yaml
pnpm --filter @wgogol/changelog-live exec tsx -C @syrokomskyi/source src/cli.ts -c changelog.config.yaml
```

## Configuration

Each workspace with a `changelog.config.yaml` controls its own:

- **git.paths** — which paths to collect commits from (including historical rename paths)
- **languages** — primary language for `CHANGELOG.md`, translations for `CHANGELOG.{lang}.md`
- **ai.generation / ai.translation** — provider (openai, anthropic, gemini) and model
- **grouping.startDay** — week start day (default: Thursday)
- **sortOrder** — `desc` (newest first) or `asc`
- **publicChangelog** — when `true`, also generates `CHANGELOG_PUBLIC.md` with client-facing categories and summaries (see below)

Default settings are in `changelog.config.default.yaml` at the repo root. The `init` subcommand reads this file when creating new configs.

## API keys

Set in `.env` at the repo root or as environment variables:

- `OPENAI_API_KEY` — for OpenAI provider
- `ANTHROPIC_API_KEY` — for Anthropic provider
- `GEMINI_API_KEY` — for Gemini provider

The CLI auto-loads `.env` from the git repo root.

## Public changelog

When `publicChangelog: true` is set in `changelog.config.yaml`, the tool generates an additional `CHANGELOG_PUBLIC.md` alongside the internal `CHANGELOG.md`:

- **Separate categories**: Added, Improved, Fixed, Security & Compliance, Integrations
- **AI-generated title** with date range (e.g. `Plattform-Updates für die Woche 2026-07-10 — 2026-07-17`)
- **Summary paragraph** (2–3 sentences) for client-facing audience
- **Independent incremental flow** — reads `CHANGELOG_PUBLIC.md` to determine last entry, generates sections regardless of internal changelog state
- **Translations** — `CHANGELOG_PUBLIC.{lang}.md` files for each configured translation language

## Adding changelog to a new project

1. Run `pnpm --filter @syrokomskyi/<new-package> run changelog:init` from the monorepo root.
2. This auto-discovers all historical git paths via rename tracing and creates `changelog.config.yaml`.
3. Then run `pnpm changelog` to generate the first `CHANGELOG.md`.

The `@wgogol/changelog-live` devDependency and `changelog` / `changelog:init` scripts must be present in the workspace's `package.json`. Most workspaces already have them — copy from an existing package if needed.

## What NOT to do

- Do not manually edit `CHANGELOG.md` or `CHANGELOG_PUBLIC.md` — these are generated files.
- Do not commit changelog files without running the generation tool.
- Do not add `changelog.config.yaml` to `.gitignore` — it is a tracked config file.
- Do not change the week grouping parameters (`grouping.startDay`) without coordinating — it affects how weeks are split across all historical commits.
