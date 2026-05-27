# `pipelines-webgogol-4` Monorepo Guidelines

## Monorepo scope

- This repository is a Turborepo monorepo.
- Treat `apps/*` as runnable workspace applications.
- Treat `packages/*` as shared reusable packages and internal libraries.
- Do not treat apps inside `apps/*` as standalone repositories.
- Run workspace commands from the monorepo root with `pnpm turbo ...`.
- Prefer running tasks through Turborepo tasks instead of invoking underlying tools directly.
- Never guess Turborepo CLI flags. Check docs or `--help` first when unsure.

## Terminology

- Inticle = Int|eractive Art|icle.
- In prompts and any user-facing text, use only `article` / `статья`.
- Use `inticle` only in English code identifiers and file or directory names.

## Architecture rules

- Keep app-specific orchestration, prompts, input/output data, and pipeline steps inside the app directory.
- Move shared utilities, helpers, cross-app abstractions, and reusable runtime logic to `packages/*` when they are useful beyond one app.
- When creating or refactoring a pipeline app, classify each new piece of logic as app-specific or reusable before adding files.
- Prefer shared framework code from `packages/pipeline-core`, `packages/pipeline-node`, `packages/pipeline-ai`, and `packages/pipeline-steps` before introducing app-local framework code.
- Consume shared framework code only through official package exports and subpaths instead of deep `src` imports.
- Avoid nested workspace configuration inside apps.

## Unified gogol creation contract

- Create every gogol from the same split of responsibilities: declaration markdown defines operator-facing metadata and factory config, app code defines app-specific orchestration, and `packages/*` define reusable runtime or framework behavior.
- Start every new gogol from a single operational goal with explicit inputs, outputs, and stop conditions instead of combining unrelated concerns in one class.
- Validate required `.input/*`, upstream artifacts, and config before execution starts; a gogol must fail fast before creating a fresh step output directory when prerequisites are missing or invalid.
- Keep artifact contracts explicit and stable: declared artifacts, actual writes, step numbering, and guide metadata must all describe the same step shape.
- Route all provider calls, AI logging, and response persistence through shared helpers or shared logging contracts so every gogol emits the same `AI/ai-<k>/` structure with request and response artifacts.
- Extract reusable gogol building blocks to `packages/*` as soon as the concern affects more than one app or belongs to the shared engine boundary.

## Dependency-first rule

- **Prefer well-maintained npm packages over hand-rolled implementations.** When an established package in the pnpm registry (e.g. `marked` for Markdown→HTML, `csv-stringify` for CSV, `zod` for validation, `sharp` for image transforms) satisfies the need, use `pnpm add` and import it. Do not write a custom implementation for a concern that has an actively-maintained package.
- The only exceptions are: (a) the package pulls heavyweight native binaries (> 50 MB) that would break fixture-only runs (use dynamic `import()` in that case), or (b) the logic is genuinely trivial — under 20 lines with no edge cases.
- When you discover an existing hand-rolled implementation that could be replaced, file the replacement as a separate task rather than silently keeping the custom code.
- See [`.agents/rules/rendering.md`](.agents/rules/rendering.md) for the canonical list of rendering packages used in this monorepo.

## TypeScript and code style

- Use TypeScript for type safety and better developer experience.
- Use `??` instead of `||` for nullish coalescing.
- Prefer `satisfies` for configs and constant tables to validate shape without making values readonly.
- Use `as const` only when literal unions, `keyof typeof` sources, or fixed-length tuples are intentional.
- Always use the `override` modifier when overriding class members.
- Keep ESM, TypeScript strictness, and 2-space indentation.
- Do not remove debug `console.*` statements.
- Do not remove existing comments unless the task explicitly requires it.
- Write comments and documentation in English.
- Do not comment obvious code. Comment difficult areas where the explanation improves maintainability.
- Ignore folders whose names start with `old-` or `-`.

## `@org/source` custom condition — compile-time & runtime

- All `@org/*` packages expose a `@org/source` export condition pointing to `./src/index.ts` for direct source-level consumption.
- `tsconfig.base.json` sets `customConditions: ["@org/source"]` so TypeScript resolves every `@org/*` import to source at compile time.
- **Every `tsx` invocation must pass `-C @org/source`** to make the runtime resolver use the same condition. Without it, `tsx` resolves through `exports` → `dist/`, where `__dirname`-relative `readFileSync` calls break (JSON data files are not copied by `tsc`).
- All `start`, `dev`, and other tsx scripts in `apps/*/package.json` already include `-C @org/source`. **Never remove this flag** and never try to add back `tsconfig.json` `paths` as a substitute — they were eliminated for good reason (self-validating resolution, zero duplication).
- When creating a new app or adding a new tsx script, always include `-C @org/source`.

## Runtime data contract

- Pipeline apps may contain `.input/`, `.output/`, and `.inticles/` as app-local runtime directories.
- `.input/` contains manually prepared input data for that app.
- `.output/` contains generated artifacts and execution logs for that app.
- `.inticles/` contains app-local domain data and resources for that app.
- App-local runtime directories are not shared packages and should not be moved to the monorepo root.
- Content inside `.input/` must not be treated like source code for linting or formatting.
- Service inputs such as `.input/brief.md` must not be treated as raw client materials unless a gogol explicitly consumes them that way.
- **Console output must use relative paths**, resolved from the monorepo (git) root, never absolute Windows or Unix paths. `packages/pipeline-core` already normalises this via `toRelativePath` inside `formatPipelineStart`, `formatPipelineFinished`, and `formatDryRunSummary`. Do not bypass these helpers with raw `console.log(absolutePath)` in new code.
- **Pipeline apps must use shared formatting wrappers from `@org/pipeline-core`** (`formatPipelineStart`, `formatPipelineOverview`, `formatPipelineFinished`) and delegate step-level output to the pipeline engine via gogol `guide` metadata. See [`.agents/rules/pipeline-apps.md`](.agents/rules/pipeline-apps.md) for the complete console output formatting rules.

## IDE and repository boundaries

- Root-level project guidance should live in `AGENTS.md` files scoped by directory, plus the `.agents/rules/*` deep-dive files they reference.
- Root `.vscode/*` settings are authoritative for the monorepo.
- Remove nested app-level `.vscode`, `.windsurf`, `node_modules`, and workspace files when they duplicate root behavior.
- Do not introduce editor-specific or tool-specific AI rule files (`.windsurfrules`, `.cursorrules`, `.aider.conf`, etc.). AI instructions stay in `AGENTS.md` and `.agents/*` so every AI client reads the same rules.
- Treat `spec/**` as read-only reference material.
- If a spec is outdated, update implementation docs or project rules instead of changing spec files.

## GRACE documentation requirement

- Every authored source file under `apps/*/run/` and `apps/*/tools/` must have valid GRACE scaffolding: `MODULE_CONTRACT`, `MODULE_MAP`, and `CHANGE_SUMMARY`.
- When making any code change in `apps/*`, update or add the GRACE header in every file you touch and append a new `CHANGE_SUMMARY` item describing the change.
- After any code change in an app, `grace.validate` must pass with exit code 0 before the task is done.
- See [`apps/AGENTS.md`](apps/AGENTS.md) for the full GRACE rules, required header structure, and per-app commands.

## Phase 9 patterns — shared steps, observability, ops

- **Step base classes in `packages/pipeline-steps` cover the recurring cross-cutting concerns.** Before writing a new gogol, scan the dispatch table in [`packages/pipeline-steps/README.md`](packages/pipeline-steps/README.md):
  - `RateLimitedHttpStep` for any gogol that calls a 3rd-party HTTP API.
  - `PlaywrightPooledStep` for any gogol that drives a browser.
  - `CrossDbReadOnlyStep` for any gogol that reads an upstream pipeline's SQLite DB.
  - `KAnonymityGateStep` for any gogol that publishes data derived from human subjects (DSGVO).
  - `WaitHumanStep` / `PausePipelineStep` for synchronous human gates.
- **Do not re-implement these concerns inline in a gogol.** If the base class is missing a feature, extend the base class — not the consumer.
- **`CrossDbReadOnlyStep`: prefer the return-value form of `withReadOnlyDbs`.** Capturing into an outer `let` from inside the async callback forces `as unknown as X` casts later because TypeScript cannot narrow across an `await` boundary. Return the scratch from the callback; let `T` inference do the work. `openReadOnly` throws if called outside `withReadOnlyDbs`.
- **Logs are NDJSON.** Use `createJsonLogger({ app, pipeline })` from `@org/pipeline-core` for anything ops-facing (scripts, daemon loops, cross-pipeline orchestrators). Schema: `{ ts, level, app, pipeline, gogol, batchId, msg, ...ctx }`. Raw `console.log` inside individual gogol bodies stays (per the no-debug-removal rule) but new scripts should go through the JSON logger so `jq` / Loki work out of the box.
- **Ops scripts live in `scripts/` (workspace `@org/scripts`).** See [`scripts/README.md`](scripts/README.md):
  - `run-cadence.ts` — cadence orchestrator, `.cadence-state.json`, daemon + `--run-now` modes.
  - `report-pipeline-health.ts` — health report across every `*.db`, alerts on failed/stuck/missing-meta.
  - `archive-batch.ts` — cold-storage layout `archive/{app}/{yyyy}/{batchId}.tar.zst` + SHA-256 MANIFEST + retention rules.
- **Anti-pattern rule:** if an app grows a second copy of the "open upstream DB read-only and hash it", "schedule rate-limited HTTP", "pool a browser", or "k-anonymity gate" logic, migrate **both** copies to the base class in the same PR. No orphan copies.

## Development workflow

- Rebuild relevant shared packages before starting a pipeline app when runtime behavior depends on package output.
- Use `pnpm turbo run build --filter=@org/pipeline-core --filter=@org/pipeline-node --filter=@org/pipeline-ai --filter=@org/pipeline-steps` when a full shared runtime rebuild is needed.
- If an app consumes additional shared packages or subpaths at runtime, include all relevant packages in the build pass.
- When adding a new app in `apps/*`, add its `tsconfig.json` to the root `tsconfig.json` references and verify the workspace with the relevant root-level Turbo check tasks.

## Creating a new pipeline app

- Every new pipeline app in `apps/*` must follow the authoritative checklist in [`.agents/rules/new-pipeline-app.md`](.agents/rules/new-pipeline-app.md). Do not improvise layout, file names, or bootstrap wiring — copy from `apps/site` (primary reference) or `apps/inticle` (when feature-flag routing is needed).
- Write markdown declarations (`run/pipeline-definition/<lang>/pipeline.md` → `phases/*.md` → `gogols/*.md`) before any gogol TypeScript class. Declarations are the source of truth for phase ordering, guide metadata, and factory wiring.
- Use the declaration frontmatter templates in [`.agents/prompts/generate-declarations.md`](.agents/prompts/generate-declarations.md). Use the code transformation patterns in [`.agents/prompts/transform-code.md`](.agents/prompts/transform-code.md) for gogol classes, AI calls, state, and registries.
- Migrating an imperative legacy pipeline into this architecture: follow [`.agents/rules/migration-guide.md`](.agents/rules/migration-guide.md) and start from analysis with [`.agents/prompts/analyze-legacy-pipeline.md`](.agents/prompts/analyze-legacy-pipeline.md).

## AI instruction index

Every AI client reading this repository should treat the following as authoritative. Lower-scope files extend higher-scope ones.

Scoped `AGENTS.md` files:

- [`AGENTS.md`](AGENTS.md) — this file, monorepo-wide rules.
- [`apps/AGENTS.md`](apps/AGENTS.md) — pipeline app layout, declaration-driven contract, gogol rules, AI and runtime contract, GRACE documentation requirement, anti-patterns.
- [`apps/hdri-factory/AGENTS.md`](apps/hdri-factory/AGENTS.md) — imperative crawl-factory chain rules (locality invariant, DB naming, ext_* tables, k-anonymity, stratified sampling).
- [`packages/AGENTS.md`](packages/AGENTS.md) — responsibilities of each shared package and extraction guidance.
- [`spec/AGENTS.md`](spec/AGENTS.md) — read-only spec boundary.

Deep-dive rules under `.agents/rules/`:

- [`project-guide.md`](.agents/rules/project-guide.md) — monorepo addendum, reference points, development workflow.
- [`pipeline-apps.md`](.agents/rules/pipeline-apps.md) — phase and gogol design deep-dive, registry rules, shared-first extraction checklist.
- [`new-pipeline-app.md`](.agents/rules/new-pipeline-app.md) — authoritative checklist for creating a new app in `apps/*`.
- [`migration-guide.md`](.agents/rules/migration-guide.md) — migrating legacy imperative pipelines.
- [`typescript.md`](.agents/rules/typescript.md) — TypeScript and style supplement.
- [`html-to-markdown.md`](.agents/rules/html-to-markdown.md) — standard pattern for HTML→Markdown gogols: required libraries, core function, artifact layout, what not to do.
- [`rendering.md`](.agents/rules/rendering.md) — canonical list of rendering packages (Markdown→HTML, CSV, badges, PDF, etc.); do not hand-roll any concern covered here.
- [`AGENTS.md`](.agents/rules/AGENTS.md) — Turborepo bridge reminders.

Reusable prompt templates under `.agents/prompts/`:

- [`analyze-legacy-pipeline.md`](.agents/prompts/analyze-legacy-pipeline.md) — structured legacy pipeline analysis.
- [`generate-declarations.md`](.agents/prompts/generate-declarations.md) — declaration frontmatter templates.
- [`transform-code.md`](.agents/prompts/transform-code.md) — code transformation patterns.
