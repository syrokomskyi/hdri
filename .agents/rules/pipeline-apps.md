# Pipeline app deep-dive for `apps/*`

Use this file only for phase-driven pipeline details that go beyond `apps/AGENTS.md`.

## Phase design rules

- One phase should represent one milestone, handoff, or operational segment.
- Use nested phases when a milestone contains distinct internal sub-routes.
- Keep phase metadata explicit: `title`, `purpose`, `entryCriteria`, `successSignals`, `exitCriteria`, and `members`.
- Put optional members behind declaration-level feature gates instead of ad hoc branching inside `run/pipeline.ts`.
- Keep phase ids stable unless a deliberate migration is performed, because order affects output numbering.

## Gogol design rules

- One gogol should own one operational goal.
- A gogol class should extend the app base `Gogol` or another shared pipeline step abstraction.
- If a step is generic enough to be reused across apps, prefer a shared `PipelineStep<PipelineContext>` subclass from `packages/*` over an app-local base-only implementation.
- Each gogol declaration should define a factory plus operator-facing metadata such as `title`, `purpose`, `inputs`, and when useful `outputs`, `definitionOfDone`, `decisionType`, and `notes`.
- Prefer shared human gate abstractions from `@syrokomskyi/pipeline-steps` (for example `WaitHumanStep`) instead of re-implementing pause/wait logic per app.
- Any gogol that depends on concrete upstream files must formalize those dependencies as declared upstream artifacts and validate or read them through shared artifact helpers.
- Do not keep critical upstream dependencies only as `ctx.getOutputPath(...)`, `ctx.outputDir`, or `path.join(...)` conventions when the producer can declare artifacts.
- A producer gogol must not declare a root-level artifact and then write the real file into an extra nested `<stepId>/...` folder.
- If a gogol supports reuse, it must restore the minimum required state from artifacts when rerun.
- Any gogol that prints file paths or directories must print them relative to the workspace root, not as absolute paths.
- Do not keep markdown, JSON, or text artifact scaffolds inline inside `run/gogols/*.ts` when that content is a reusable template; render it through the app template helper and Handlebars.

## YAML artifact format rules

- **All structured pipeline artifacts must be YAML (`.yaml`), not JSON.** See root `AGENTS.md` § YAML artifact convention for the full rule.
- Each app provides a `yaml-utils.ts` helper (`stringifyYaml`, `parseYaml`) in `run/pipeline/` — use it for all YAML serialization and parsing.
- Artifact IDs in declarations and code use a `Yaml` suffix (e.g. `subQuestionsYaml`, `claimsYaml`, `resultYaml`), not `Json`.
- Human review gates use a `_TODO` placeholder line at the top of the YAML file; the pipeline pauses until the operator removes it.
- JSON is only for machine-internal logs (`usage.json`), NDJSON streams, and config files (`package.json`, `tsconfig.json`).

## Console output formatting rules

- **Main entry point (`run/main.ts`) must use shared formatting wrappers:**
  - Use `createMainEntry` from `@syrokomskyi/pipeline-node/cli` to handle `dotenv.config()`, CLI argument parsing, `PipelinePauseError` (exit code 2), and general error formatting (exit code 1). This eliminates hand-rolled `main.ts` boilerplate.
  - `formatPipelineStart()` — for pipeline start banner (inside `run-app.ts`)
  - `formatPipelineOverview()` — for pipeline guide summary (inside `run-app.ts`)
  - `formatPipelineFinished()` — for pipeline completion banner (inside `run-app.ts`)
- **Each gogol must expose a `guide` object** with `title`, `purpose`, `decisionType`, `inputs`, `outputs`, and `definitionOfDone` so the engine can render proper step guides. The engine calls `formatStepGuide()` from `@syrokomskyi/pipeline-core` automatically.
- **Always use the structured NDJSON logger** from `@syrokomskyi/pipeline-core` (`createJsonLogger`) instead of raw `console.log`, `console.warn`, `console.error`, `console.info`, or `console.debug` inside any gogol `run()` method, helper function, or loop. Pass contextual data as the third argument for structured downstream consumption (e.g. `jq`, Loki).
- **Raw `console.log()` is prohibited** for progress tracking, diagnostics, or any other purpose inside pipeline apps. It bypasses the shared formatting layer and produces inconsistent, unparsable output. Use `log.info`, `log.warn`, `log.error`, `log.debug` on a `JsonLogger` instance bound with `{ app: '<app-name>', pipeline: '<pipeline-name>', gogol: this.id }`.
- **Inside loops**, instantiate the logger once before the loop and reuse it. Do not create a new logger per iteration.
- Example pattern:
  ```typescript
  import { createJsonLogger } from '@syrokomskyi/pipeline-core';
  const log = createJsonLogger({ app: 'observatory', pipeline: 'observatory' })
    .withContext({ gogol: this.id });
  log.info('step-start', 'Processing batches', { batchCount: batches.length });
  ```
- **Import formatting utilities from `@syrokomskyi/pipeline-core`**:
  ```typescript
  import {
    formatPipelineStart,
    formatPipelineOverview,
    formatPipelineFinished,
  } from '@syrokomskyi/pipeline-core';
  ```
- **Use `toRelativePath()` from `@syrokomskyi/pipeline-core`** when outputting any file paths in artifacts or console messages. This is already integrated into `formatPipelineStart`, `formatPipelineFinished`, and `formatDryRunSummary`.
- **Pipeline apps must follow the standard declaration-driven pattern** for console output:
  - Gogols in `run/gogols/*.ts` with guide metadata
  - Pipeline definition in `run/pipeline.ts`
  - Context factory in `run/pipeline/context/create-context.ts`
  - Engine runner in `run/pipeline/engine.ts`
- **Do not implement monolithic `main.ts` scripts** that directly execute all logic with inline `console.log` calls. Refactor into gogols and delegate to the pipeline engine.

## Registry rules

- Use `createPhaseRegistry` from `@syrokomskyi/pipeline-node/declarations` to build the phase registry — it generates `isPhaseId` and `createPhaseById` from a phase ID list and an `AppPhase` factory, eliminating hand-rolled phase subclasses and dispatch functions.
- Use `createGogolRegistry` from `@syrokomskyi/pipeline-node/declarations` to build the gogol registry — it maps declaration factory ids to concrete step instances with explanation attachment.
- Keep a dedicated phase registry that maps phase ids to phase constructors.
- Keep a dedicated gogol registry that maps declaration factories to concrete gogol instances.
- Parse declaration config in the registry layer instead of spreading config parsing across the app.
- Prefer shared declaration materialization helpers from `@syrokomskyi/pipeline-node/declarations` for loading phase declarations, resolving enabled members, and building explain metadata before adding app-local registry glue.
- Do not instantiate a long sequence of gogols directly inside `run/pipeline.ts`.
- Type registries and pipeline members against shared `PipelineStep<PipelineContext>` contracts so shared step abstractions can participate without app-local adapters.

## Shared package usage

- If a capability would benefit another pipeline app, implement or extract it in `packages/*` instead of cloning it into the app.
- Keep only app-specific brief schema, prompts, features, registry wiring, and step logic inside the app.
- Pipeline apps must satisfy `.agents/architecture.manifest.json`: do not add dependencies listed in `forbidden_pipeline_dependencies` unless a temporary exception with a removal plan is recorded in the manifest.

## Shared-first extraction checklist

- Extract to `packages/pipeline/pipeline-core` when the concern changes pipeline contracts, engine behavior, phases, steps, or guide rendering.
- Extract to `packages/pipeline/pipeline-node` when the concern is Node runtime, filesystem access, artifact helpers, path generation, logging, or frontmatter/declaration loading primitives.
- Extract to `packages/pipeline/pipeline-ai` when the concern is provider communication, structured AI helpers, response normalization, or AI JSON parsing.
- Extract to `packages/pipeline/pipeline-steps` when the concern is a reusable operational step or human/manual gate abstraction.
- Keep a helper inside the app only when it is tightly coupled to that app's prompt/domain/output contract.

## Runtime and output contract

- Each AI log must capture the provider, model, version, system prompt, and all user prompts. Multimodal calls should also log input images or other binary payloads when available.
- If an app context exposes Anthropic or OpenAI helper functions, type and wire them through the shared logging-aware helper contracts from `@syrokomskyi/pipeline-node/ai` instead of app-local helper signatures.
- Operator-facing guide content must stay truthful for optional branches and current feature flags.
- Missing manual input in `.input/` is a blocking validation error, not an optional no-op. If a declaration says a gogol expects `.input/` materials, the gogol must pause the pipeline until those files exist and are valid for that step.
- If a downstream gogol does not have enough valid input from previous gogols, it must stop before creating a fresh `.output/N-<gogolId>/` directory for itself.
- Prompt templates that still contain `TODO` or `TBD` must pause the pipeline in shared engine logic before the step starts, even if the gogol forgot to implement a local prompt readiness check.
- The shared runtime should print the full standard step guide for that gogol before pausing and should tell the pipeline operator exactly what upstream artifact is missing or invalid.
- Reuse based on valid artifacts is allowed only for steps whose declared artifacts actually describe the files they produce; do not rely on reuse to skip validation for steps without a real artifact contract.
- If multiple gogols share the same template-driven skip-if-exists behavior, keep that idempotent artifact-writing flow in shared template helpers under `@syrokomskyi/pipeline-node/templates` rather than re-implementing it in app utilities.

## AI-specific rules

- If an OpenAI text step expects JSON, prefer `createOpenAiJson(...)` over manually chaining `createOpenAiText(...)` and `parseAiJson(...)`.
- Reuse one AI call context object for the actual provider request and logging side effects.
- Keep gogol-specific schema and business validation after shared parsing.

## Anti-patterns

- Do not copy pipeline framework files from one app to another when the concern belongs in `packages/*`.
- Do not duplicate guide rendering, output numbering, artifact validation, or AI logging inside an app.
- Do not keep app-local `gray-matter` declaration caches, repeated OpenAI logging wrappers, or local validator combinators once shared helpers exist in `packages/*`.
- Do not add optional branches only in code while leaving declarations and guide metadata stale.
- Do not treat app-local runtime directories as shared workspace packages.

## Creation workflow for a new pipeline app

- Create the app in `apps/*` following the repository's Turborepo workspace conventions.
- Add the shared package dependencies needed for the pipeline runtime.
- Add the new app `tsconfig.json` to the root `tsconfig.json` `references` array when the repository uses TypeScript project references.
- Add `paths` mappings for every shared package subpath the app consumes during no-emit TypeScript checks.
- Create the app-local brief/input contract and runtime context extensions.
- Define top-level phases in `run/pipeline-definition/<lang>/pipeline.md`.
- Define phase files before wiring concrete gogol classes.
- Define gogol declaration files before or together with gogol implementations.
- Build a phase registry using `createPhaseRegistry` from `@syrokomskyi/pipeline-node/declarations` and a gogol registry using `createGogolRegistry` from the same package.
- Use `createMainEntry` from `@syrokomskyi/pipeline-node/cli` in `run/main.ts` instead of hand-rolling dotenv, CLI parsing, and error handling.
- Keep `run/pipeline.ts` limited to declaration loading, build-context preparation, and `definePipeline(...)`.
- Use shared frontmatter helpers for declaration loading before introducing app-local markdown parsing code.
- Move reusable helpers into `packages/*` as soon as they stop being app-specific.

## Migration from legacy pipelines

When migrating an existing imperative pipeline:

- Start from declarations (pipeline.md, phases/_.md, gogols/_.md)
- Transform code only after declarations are complete and validated
- Preserve operational behavior while adapting to new contracts
- Extract reusable logic to packages/\* during migration
- Keep legacy reference material in `spec/**`, but make sure migrated legacy snapshots under `spec/**` are excluded from Turborepo task inputs and workspace automation scans
- Add the migrated app `tsconfig.json` to the root `tsconfig.json` `references` array when the repository uses TypeScript project references
- Run the relevant root-level Turbo check tasks after wiring the app into the monorepo
- Generate migration report for manual review
