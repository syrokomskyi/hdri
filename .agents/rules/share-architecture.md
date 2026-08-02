# Shared `.share/` Directory Architecture

## Purpose

Cross-app shared data that multiple pipeline apps need to read from or write to. This avoids duplicating shared resources (like source whitelists) in each app's `.input/` directory.

## Location

```
apps/.share/
  .input/          # Operator-managed, read-only by pipelines, committed to git
    whitelist.md   # Trusted source domains whitelist
  .output/         # Pipeline-generated suggestions, write-only by pipelines, gitignored
    gen/truth/     # Per-app output, scoped by appGroup/appName
      whitelist-suggestions.md
```

## Rules

### `.share/.input/` (read-only by pipelines)

- **Operator-managed**: The operator creates and maintains these files.
- **Committed to git**: These are seed data, not generated artifacts.
- **Pipelines read only**: Gogols must never write to `.share/.input/`.
- **Flat structure**: Files are not scoped per-app. All apps share the same input files.
- **File naming**: Always `whitelist.md`, never `source-whitelist.md`.

### `.share/.output/` (write-only by pipelines)

- **Pipeline-generated**: Gogols write suggestions and derived data here.
- **Gitignored**: These are generated artifacts, not committed.
- **Per-app scoped**: Each app writes to `.share/.output/<appGroup>/<appName>/`.
- **Operator sync workflow**:
  1. Pipeline writes suggestions to `.share/.output/<app-group>/<app-name>/whitelist-suggestions.md`
  2. Operator reviews suggestions
  3. Operator copies approved entries into `.share/.input/whitelist.md`
  4. Operator commits `.share/.input/whitelist.md`

## Pipeline context access

Gogols access shared directories via `PipelineContext`:

```ts
ctx.shareInputDir   // absolute path to apps/.share/.input/
ctx.shareOutputDir  // absolute path to apps/.share/.output/<appGroup>/<appName>/
ctx.appGroup        // e.g. "gen"
ctx.appName         // e.g. "truth"
```

These are set by `createAppPaths` in `@syrokomskyi/pipeline-node/paths` and propagated through `create-context.ts`.

## Whitelist file format

`.share/.input/whitelist.md` uses YAML frontmatter + markdown body:

```markdown
---
version: 1
updated: 2026-07-24
domains:
  - domain: nngroup.com
    trust: high
    notes: "Nielsen Norman Group — UX research authority"
  - domain: uxdesign.cc
    trust: medium
    notes: "UX design publication, variable quality"
---

# Source Whitelist

Trusted domains for source verification in research pipelines.
Domains with `trust: high` get elevated reliability scores in evidence assessment.
```

## Adding new shared input files

1. Create the file in `apps/.share/.input/`
2. Add a parser in the consuming gogol
3. Document the file format here
4. Ensure the file is committed to git (`.share/.input/` is NOT gitignored)
