# Pipeline App Guidelines

Apply these rules when reading or editing files under `apps/**`.

## Scope and priorities

- Treat `apps/inticle` as the reference pipeline application, but do not blindly copy framework code from it.
- Reuse the shared pipeline framework from `packages/*` first.
- Keep apps thin and move reusable execution or framework logic into `packages/*`.
- Keep the runtime route, guide generation, and actual gogol order aligned to the same source of truth.

## Required app layout

- `run/main.ts`: application entrypoint.
- `run/run.ts`: thin launcher for the entrypoint.
- `run/app/*`: app bootstrapping, environment setup, client creation, input bootstrap, and top-level orchestration.
- `run/pipeline.ts`: thin pipeline assembly that loads declarations, prepares build context, creates phases via registries, and calls `definePipeline(...)`.
- `run/pipeline/*`: declaration loading, build types, context types, registries, app-specific pipeline helpers, and optional app phase adapters.
- `run/pipeline-definition/<lang>/pipeline.md`: top-level route declaration listing top-level phases.
- `run/pipeline-definition/<lang>/phases/*.md`: one file per phase with metadata and ordered member ids.
- `run/pipeline-definition/<lang>/gogols/*.md`: one file per gogol with factory config and operator-facing guide metadata.
- `run/gogols/*`: concrete gogol implementations.
- `run/prompts/*`: app-specific prompts.
- `run/templates/<gogol-id>/*`: app-local Handlebars templates for gogol-generated artifacts.
- `.input/brief.md`: required manual brief file that defines the global output language for all prompts in that app.

## Declaration-driven source of truth

- `run/pipeline-definition/<lang>/pipeline.md` is the source of truth for top-level phases.
- Phase files are the source of truth for phase ordering, nesting, and feature-gated members.
- Gogol markdown files are the source of truth for guide metadata and factory config.
- `run/pipeline.ts` must stay thin and must not become a second route-definition layer.
- Step numbering must come from the flattened declaration order of gogols.
- Guide generation must stay aligned with the same declaration tree used to build the runtime pipeline.

## Pipeline architecture contracts

- Start from a declaration-driven route, not from a hardcoded array of steps.
- Resolve phase ids through a phase registry and gogol factories through a gogol registry.
- Type registries and pipeline members against shared `PipelineStep<PipelineContext>` contracts.
- `PipelinePhase` defines nested route structure and explainable phase metadata.
- Keep `run/pipeline.ts` focused on declaration loading, runtime build context, and `definePipeline(...)`.
- Keep phase ids stable unless a deliberate migration is performed, because order affects output numbering.

## Gogol rules

- One gogol should own one operational goal.
- Create a new gogol in the same order every time: define declaration metadata first, define artifacts and prerequisites second, then implement the smallest runtime needed to produce those artifacts.
- Gogol classes must stay thin.
- Keep reusable validation, AI, artifact, and filesystem behavior in shared packages; app gogols should compose shared primitives instead of re-implementing framework mechanics.
- Keep operator-facing descriptions, guide text, and step explanations in declaration markdown, not inline in `run/gogols/*.ts`.
- Operator-facing declaration text in `run/pipeline-definition/<lang>/gogols/*.md` must be written in English.
- Human approval steps must use `decisionType: human_confirms` or `client_chooses` and must describe which artifacts unblock the next step.
- Prefer shared human gate abstractions from `@org/pipeline-steps` instead of re-implementing pause or wait logic per app.
- If a gogol requires `.input/` materials, upstream artifacts, or any other prerequisite data, validate them in `validateBeforeStart(...)`.
- Fail-fast validation that must stop execution before creating the step output directory belongs in `validateBeforeStart(...)`, not in `run(...)`.
- A gogol must not silently continue, emit placeholder artifacts, or create a fresh `.output/N-<gogolId>/` directory when required input is missing or invalid.
- Downstream gogols must read upstream artifacts through validated context helpers and artifact accessors, not guessed file paths.
- Producer gogols must keep declared `artifacts` aligned with the files or directories they actually write.
- Declared artifact paths are relative to the step root `.output/N-<gogolId>/`, not an extra nested folder.
- If a gogol writes a template-driven artifact, store its Handlebars template under `run/templates/<gogol-id>/<artifact-relative-path>.hbs`.
- Gogols that produce guides, playbooks, or process-documentation (e.g., `client-process-guide`, `maintenance-playbook`) must store their shared templates under `run/guides/` and reference them via `writeGogolGuideArtifactsIfMissing` instead of generating via LLM.
- If multiple gogols need the same execution pattern, extract a shared factory, helper, validator, or base abstraction to `packages/*` instead of cloning the implementation.

## AI and prompt rules

- If the app uses AI prompts, `.input/brief.md` is a required service input defining the global output language for the run.
- All prompt files and inline system prompts must explicitly force the output language declared in `.input/brief.md`.
- Prompt templates that still contain `TODO` or `TBD` must pause the pipeline before the step starts.
- Never call `JSON.parse` directly on raw LLM output when structured output is expected. Use shared helpers from `@org/pipeline-ai`.
- If an OpenAI step expects JSON, prefer `createOpenAiJson(...)` over manually chaining text generation and parsing.
- Reuse one AI call context object for the actual provider request and for logging side effects.
- Each AI log must capture provider, model, version, system prompt, and all user prompts.
- Each AI log must also persist the full model response in the same step-local `AI/ai-<k>/` directory as `response-*.md` next to `llm.md`, prompts, and any logged images or data.
- Prefer shared logging-aware adapters such as `createLoggedOpenAiHelpers(...)` and `createLoggedAnthropicHelpers(...)`.

## Runtime and output contract

- Step outputs live under `.output/N-<gogolId>/`.
- Execution guide artifacts live under `.output/_guide/*`.
- Step-local onboarding lives in `.output/N-<gogolId>/step-guide.md`.
- AI call logs live inside the current step output directory as `AI/ai-<k>/`.
- Invalid artifacts should be preserved as `*.invalid-<attempt>`.
- If required manual input or upstream artifacts are missing or invalid, the runtime must fail fast before creating a fresh step output directory.
- In a fail-fast case, the runtime must print the standard step guide and clearly explain what is missing or invalid.
- **Console output must use shared formatting wrappers from `@org/pipeline-core`** (`formatPipelineStart`, `formatPipelineOverview`, `formatPipelineFinished`). Step-level output is handled by the pipeline engine via gogol `guide` metadata. See [`.agents/rules/pipeline-apps.md`](.agents/rules/pipeline-apps.md) for complete console output formatting rules.

## Shared-first extraction checklist

- Extract to `packages/pipeline-core` when the concern changes pipeline contracts, engine behavior, phases, steps, or guide rendering.
- Extract to `packages/pipeline-node` when the concern is Node runtime, filesystem access, artifact helpers, path generation, logging, prompt/template helpers, or declaration loading.
- Extract to `packages/pipeline-ai` when the concern is provider communication, structured AI helpers, response normalization, or AI JSON parsing.
- Extract to `packages/pipeline-steps` when the concern is a reusable operational step or human/manual gate abstraction.
- Keep logic inside an app only when it is tightly coupled to that app's prompt, domain, or output contract.

## GRACE documentation

Every source file under `apps/**/run/` and `apps/**/tools/` that is authored (not generated, not a test file) must carry valid GRACE scaffolding at all times.

### What must be present in every authored file

- `MODULE_CONTRACT` — describes purpose, responsibilities, and non-goals.
- `MODULE_MAP` — maps logical entry keys to their roles inside the file.
- `CHANGE_SUMMARY` — lists the meaningful changes made to the file over time.

### When you add or change code

When you create a new file or make any code change to an existing file in `apps/**/run/` or `apps/**/tools/`:

1. **Add or update the GRACE header** at the top of every file you touch — `MODULE_CONTRACT`, `MODULE_MAP`, and `CHANGE_SUMMARY` wrapped in a multiline comment.
2. **Append a new item to `CHANGE_SUMMARY`** describing what you just changed. Keep each item concrete and one-line.
3. **Keep `MODULE_CONTRACT` accurate** — if you add or remove responsibilities, update the `<responsibilities>` list.
4. **Keep `MODULE_MAP` accurate** — if you add or remove logical blocks, update its entries.
5. After finishing code edits, run `grace.validate` to confirm compliance:
   ```
   pnpm --filter @org/<app-name> exec site-kernel run grace.validate --app <app-name>
   ```

### GRACE pipeline commands (per app)

Each app (`digital-observatory`, `inticle`, `site`) has these npm scripts:

- `pnpm --filter @org/<app> grace:validate` — validate GRACE compliance (must pass after every change).
- `pnpm --filter @org/<app> grace:backfill` — generate missing GRACE headers via LLM (for new files only).
- `pnpm --filter @org/<app> grace:inventory` — write `docs/grace-inventory.xml` (workspace root).
- `pnpm --filter @org/<app> grace:anchors` — add `GRACE_BLOCK` anchor markers via LLM.
- `pnpm --filter @org/<app> grace` — run the full pipeline (backfill → anchors → inventory → validate).

### Rules for AI agents

- Never create or edit a file in apps/**/run/ or apps/**/tools/ without ensuring it has a valid GRACE header before finishing the task.
- If creating a new file, write the GRACE header yourself — do not rely on `grace:backfill` for new files you are already writing.
- If editing an existing file that has no GRACE header yet (legacy), add one as part of the same change.
- `grace.validate` exit code must be 0 before the task is considered complete.

## Anti-patterns

- Do not copy pipeline framework files from one app to another when the concern belongs in `packages/*`.
- Do not hardcode flat step arrays in `run/pipeline.ts`.
- Do not duplicate guide rendering, output numbering, artifact validation, or AI logging inside an app.
- Do not add optional branches only in code while leaving declarations and guide metadata stale.
- Do not treat app-local runtime directories as shared workspace packages.

## Markdown table generation

- Always generate Markdown tables using the `markdown-table` npm package (`markdownTable()`), never hand-rolled `|---|---|` strings or manual alignment padding.
- This rule applies to every gogol or script that writes `.md` artifacts containing tables.
- When updating existing gogols, replace any manual table formatting with `markdownTable()` and add the corresponding `CHANGE_SUMMARY` item.

## Legacy migration

When migrating a legacy pipeline:

- Start with analysis and identify reusable versus app-specific code.
- Detect phases from operational handoffs and semantic grouping.
- Generate declarations first, code second.
- Preserve behavior while modernizing structure.
- Extract reusable logic to `packages/*` during migration.
- Keep legacy source material in `spec/**` as read-only reference material.
- Run the relevant root-level Turbo check tasks after wiring a migrated app into the monorepo.
- Generate a migration report for manual review.
