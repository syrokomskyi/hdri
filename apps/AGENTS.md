# Pipeline App Guidelines

Apply these rules when reading or editing files under `apps/**`.

## Scope and priorities

- Treat `apps/gen/inticle` as the reference pipeline application, but do not blindly copy framework code from it.
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
- `.input/brief.md`: required manual brief file that defines the global output language for all prompts in that app. Exception: apps that use per-video or per-item briefs (e.g. `video`) place `brief-<name>.md` co-located with each input item instead of a single root `brief.md`. In `video`, audio tracks are also co-located next to each video using the naming convention `{video-stem}-{suffix}.{ext}`, where the suffix is a digit string (numbered/background track) or an ISO 639-1 locale code (locale track); see `apps/gen/video/README.md` for details.
- `.input/brief.example.md`: required example file that mirrors the frontmatter schema and companion-file conventions of `brief.md` with placeholder content and inline field documentation. Every app with an `.input/` directory must ship a `brief.example.md` (or per-item equivalent for `video`/`image`). Example files are committed to git, serve as operator onboarding templates, and document the available configuration fields. When adding a new frontmatter field to any brief parser, update the corresponding `.example.md` file in the same change.

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
- Human approval steps must use `decisionType: human_confirms`, `human_provides_content`, `human_reviews`, or `client_chooses` and must describe which artifacts unblock the next step.
- Prefer shared human gate abstractions from `@syrokomskyi/pipeline-steps` instead of re-implementing pause or wait logic per app.
- If a gogol requires `.input/` materials, upstream artifacts, or any other prerequisite data, validate them in `validateBeforeStart(...)`.
- Fail-fast validation that must stop execution before creating the step output directory belongs in `validateBeforeStart(...)`, not in `run(...)`.
- A gogol must not silently continue, emit placeholder artifacts, or create a fresh `.output/N-<gogolId>/` directory when required input is missing or invalid.
- Downstream gogols must read upstream artifacts through validated context helpers and artifact accessors, not guessed file paths.
- Producer gogols must keep declared `artifacts` aligned with the files or directories they actually write.
- Declared artifact paths are relative to the step root `.output/N-<gogolId>/`, not an extra nested folder.
- If a gogol writes a template-driven artifact, store its Handlebars template under `run/templates/<gogol-id>/<artifact-relative-path>.hbs`.
- Gogols that produce guides, playbooks, or process-documentation (e.g., `client-process-guide`, `maintenance-playbook`) must store their shared templates under `run/guides/` and reference them via `writeGogolGuideArtifactsIfMissing` instead of generating via LLM.
- If multiple gogols need the same execution pattern, extract a shared factory, helper, validator, or base abstraction to `packages/*` instead of cloning the implementation.
- When a gogol needs to assemble LLM prompt context from multiple upstream artifacts and state fields, use `assemblePromptContext` from `run/pipeline/assemble-context.ts` with a declarative `ContextSource[]` spec instead of manual artifact reading and string concatenation.
- Privacy thresholds (k-anonymity, suppression floors) must be loaded from versioned YAML policy files under `policies/`, not hardcoded as constants. Use `loadKAnonPolicy()` from `tools/k-anon-policy.ts` as the single loader; the `effective_k_min` must never fall below `hard_floor` unless `high_risk_release` is explicitly `true` in the policy file.

## AI and prompt rules

- If the app uses AI prompts, `.input/brief.md` is a required service input defining the global output language for the run. Apps without AI prompts may instead use per-item `brief-<name>.md` files co-located with their input data (see `video` for reference). In `video`, audio tracks are also co-located using the `{video-stem}-{suffix}.{ext}` convention rather than a shared `.input/audio/` directory.
- All prompt files and inline system prompts must explicitly force the output language declared in `.input/brief.md`.
- Prompt templates that still contain `TODO` or `TBD` must pause the pipeline before the step starts.
- Never call `JSON.parse` directly on raw LLM output when structured output is expected. Use shared helpers from `@syrokomskyi/pipeline-ai`.
- If an OpenAI step expects JSON, prefer `createOpenAiJson(...)` over manually chaining text generation and parsing.
- Reuse one AI call context object for the actual provider request and for logging side effects.
- Each AI log must capture provider, model, version, system prompt, and all user prompts.
- Each AI log must also persist the full model response in the same step-local `AI/ai-<k>/` directory as `response-*.md` next to `llm.md`, prompts, and any logged images or data.
- Pass logger object (`{ logCall, writeResponse, writeUsage, logStepEvent }`) directly to AI provider functions from `@syrokomskyi/pipeline-ai` for built-in logging. `writeUsage` persists `usage.json` with real API token counts, which `LlmCostReportStep` reads for cost calculation.

## Runtime and output contract

- Step outputs live under `.output/N-<gogolId>/`.
- Execution guide artifacts live under `.output/_guide/*`.
- Step-local onboarding lives in `.output/N-<gogolId>/step-guide.md`.
- AI call logs live inside the current step output directory as `AI/ai-<k>/`.
- Invalid artifacts should be preserved as `*.invalid-<attempt>`.
- If required manual input or upstream artifacts are missing or invalid, the runtime must fail fast before creating a fresh step output directory.
- In a fail-fast case, the runtime must print the standard step guide and clearly explain what is missing or invalid.
- **Console output must use shared formatting wrappers from `@syrokomskyi/pipeline-core`** (`formatPipelineStart`, `formatPipelineOverview`, `formatPipelineFinished`). Step-level output is handled by the pipeline engine via gogol `guide` metadata. See [`.agents/rules/pipeline-apps.md`](.agents/rules/pipeline-apps.md) for complete console output formatting rules.

## YAML artifact convention

- All human-facing and intermediate structured artifacts must use YAML (`.yaml`), not JSON. See root `AGENTS.md` § YAML artifact convention for the full monorepo-wide rule.
- Each app provides a shared `yaml-utils.ts` helper (`stringifyYaml`, `parseYaml`) in its `run/pipeline/` directory — use it for all YAML serialization and parsing.
- Human review gates use a `_TODO` placeholder line at the top of the YAML file. The pipeline pauses until the operator removes the `_TODO` line and re-runs.
- Artifact IDs in gogol declarations and code should use `Yaml` suffix (e.g. `subQuestionsYaml`, `claimsYaml`, `resultYaml`) instead of `Json`.
- JSON remains acceptable only for machine-internal logs (e.g. `usage.json` for AI token counts) and package-level configuration files (`package.json`, `tsconfig.json`).
- **Line wrapping:** `stringifyYaml` must use `lineWidth: 80` so long strings wrap at 80 characters for operator readability. Never set `lineWidth: 0` (disables wrapping).

## Shared-first extraction checklist

- Extract to `packages/pipeline/pipeline-core` when the concern changes pipeline contracts, engine behavior, phases, steps, or guide rendering.
- Extract to `packages/pipeline/pipeline-node` when the concern is Node runtime, filesystem access, artifact helpers, path generation, logging, prompt/template helpers, or declaration loading.
- Extract to `packages/pipeline/pipeline-ai` when the concern is provider communication, structured AI helpers, response normalization, or AI JSON parsing.
- Extract to `packages/pipeline/pipeline-steps` when the concern is a reusable operational step or human/manual gate abstraction.
- Keep logic inside an app only when it is tightly coupled to that app's prompt, domain, or output contract.

## Testing

- App-level tests use **Vitest**, following the same policy as packages (see root `AGENTS.md` § Testing policy).
- When adding tests to a pipeline app, create a `vitest.config.ts` at the app root with `include` paths relative to the monorepo root (e.g. `"apps/gen/<app>/run/**/*.test.ts"`).
- Add a `test` script to `package.json`: `"test": "pnpm --dir ../../.. exec vitest run --config apps/gen/<app>/vitest.config.ts"`.
- Exclude test files from the build tsconfig: add `"**/*.test.ts"` to the `exclude` array so `tsc --noEmit` does not type-check test files during build.
- Test files under `apps/**/run/` do not require COMPASS scaffolding (the COMPASS rule explicitly exempts test files).

Every source file under `apps/**/run/` and `apps/**/tools/` that is authored (not generated, not a test file) must carry valid COMPASS scaffolding at all times.

### What must be present in every authored file

- `MODULE_CONTRACT` — contains `<purpose>` (at least 10 words) and `<non-goals>` (at least one `<item>`).
- `CHANGE_SUMMARY` — lists the meaningful changes made to the file over time.

### Forbidden blocks (presence is a validation error)

- `MODULE_MAP` — restates export names visible in code; removed in v2.
- `<keywords>` — restates filename and purpose; removed in v2.
- `<responsibilities>` — restates what the code does; removed in v2.
- `COMPASS_BLOCK` anchors — no consumer; removed in v2.

### `@ai-invariant` (high-risk files only)

High-risk files (signing, crypto, vault, migrations, publish, k-anon, emit, backup, rebuild, snapshot, timestamp) must include at least one inline invariant:

```ts
// @ai-invariant: <a durable constraint the code cannot show on its own>
```

### v2 block format

```ts
/*
<MODULE_CONTRACT>
  <purpose>What this file is for. One or more sentences, at least 10 words.</purpose>
  <non-goals>
    <item>Something this file must NOT do (a boundary against scope creep).</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Most recent COMPASS-relevant change to this file.</item>
</CHANGE_SUMMARY>
*/
```

### When you add or change code

When you create a new file or make any code change to an existing file in `apps/**/run/` or `apps/**/tools/`:

1. **Add or update the COMPASS header** at the top of every file you touch — `MODULE_CONTRACT` (with `<purpose>` and `<non-goals>`) and `CHANGE_SUMMARY` wrapped in a multiline comment.
2. **Append a new item to `CHANGE_SUMMARY`** describing what you just changed. Keep each item concrete and one-line.
3. **Keep `MODULE_CONTRACT` accurate** — if the file's purpose shifts, update `<purpose>`. If boundaries change, update `<non-goals>`.
4. **Add `@ai-invariant`** if the file is high-risk (signing, crypto, vault, migrations, etc.) and doesn't already have one.
5. After finishing code edits, run `forge compass.validate` to confirm compliance:
   ```
   pnpm exec forge compass.validate --root .
   ```

### Compass commands (Forge CLI)

Compass validation is provided by Forge, not per-app npm scripts:

- `pnpm exec forge compass.validate --root .` — validate Compass compliance (must pass after every change).
- `pnpm exec forge compass.inventory --root .` — write `docs/compass-inventory.xml`.
- `pnpm exec forge compass.changesummary.validate --root .` — validate CHANGE_SUMMARY blocks.
- `pnpm exec forge compass.summary.trim --root .` — trim boilerplate and cap items to 30.
- `pnpm exec forge compass.audit.plan --root .` — list files due for audit.
- `pnpm exec forge compass.audit.validate --root .` — check for audit-overdue files.

### Rules for AI agents

- Never create or edit a file in apps/**/run/ or apps/**/tools/ without ensuring it has a valid COMPASS header before finishing the task.
- If creating a new file, write the COMPASS header yourself — do not rely on `fo-compass-annotate` skill for new files you are already writing.
- If editing an existing file that has no COMPASS header yet (legacy), add one as part of the same change.
- Never add `MODULE_MAP`, `<keywords>`, `<responsibilities>`, or `COMPASS_BLOCK` to any file. `forge compass.validate` will fail with `COMPASS-FORBIDDEN-01`.
- `forge compass.validate` exit code must be 0 before the task is considered complete.

## CI and GitHub Actions

- Run scripts from the package that owns the dependency, not from the monorepo root with `pnpm exec`. For example, if `tsx` is in `packages/hdri-codebook`, run `pnpm --filter @syrokomskyi/hdri-codebook exec tsx ...` instead of `pnpm exec tsx ...` from root.
- Add `concurrency` groups to workflows to cancel superseded runs and save CI minutes.
- Keep GitHub Actions versions up to date; Node 20 is deprecated, use Node 24.
- Scope workflow commands to the owning workspace package to avoid `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`.

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
