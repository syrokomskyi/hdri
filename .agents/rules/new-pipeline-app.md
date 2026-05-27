# Creating a new pipeline app in `apps/*`

Authoritative checklist for scaffolding a new pipeline app. Follow it in order. Deviations must be justified by reference to an existing, shipping app — not invented.

Reference applications (read before scaffolding):

- `apps/site` — primary reference. Greenfield-style assembly, no feature-flag routing, `simpleFactories` record in the gogol registry. **Start here.**
- `apps/inticle` — secondary reference. Adds brief-driven feature flags (`whenFeature: ...`), per-language translation fan-out, multiple phase classes, and a `switch` in the gogol registry. Use it only when the new pipeline genuinely needs conditional phases.

This guide assumes the repo is Turborepo + pnpm workspaces. There is no scaffolding generator — create files by hand following the templates below. Do not introduce app-local copies of framework code.

## 0. Before scaffolding

- Pick a kebab-case app id (e.g. `letter`, `podcast`, `video-essay`). The pnpm package name will be `@org/<id>`.
- Decide whether the app needs the declaration-driven phase model at all. If it has fewer than ~3 steps and no human gates, it probably belongs inside an existing app, not as a new one.
- Classify every piece of planned logic: **app-specific** (prompts, domain contract, output shape) stays in the app; **reusable** (validators, artifact I/O, AI helpers, logging, human gates) must come from `packages/*`.
- Confirm which AI providers the app will call. The provider list determines the `PipelineAiServices` shape and the env vars.

## 1. Directory layout to create

Create this exact layout under `apps/<id>/`. Missing any of these files means the app is incomplete.

```text
apps/<id>/
  package.json
  tsconfig.json
  README.md
  run/
    main.ts
    run.ts
    app/
      create-clients.ts
      parse-run-options.ts
      run-app.ts
      input/
        bootstrap-brief.ts
    brief.ts
    config.ts
    pipeline.ts
    pipeline/
      Gogol.ts
      build-types.ts
      declaration.ts
      engine.ts
      gogol-registry.ts
      phase-registry.ts
      types.ts
      artifact-validators.ts
      context/
        create-context.ts
        create-context.shared.ts
      phases/
        AppPhase.ts
    pipeline-definition/
      en/
        pipeline.md
        phases/
          <phase-id>.md
        gogols/
          <gogol-id>.md
    gogols/
      <GogolName>Gogol.ts
    prompts/
      <gogol-id>.md
    templates/
      <gogol-id>/
        <artifact-relative-path>.hbs
    utils.ts
```

Additional runtime-only directories (not committed as code):

- `.input/` — manually prepared input. Must contain at minimum `.input/brief.md`. Commit only `.gitkeep` and safe templates.
- `.output/` — generated artifacts. Never committed.

Do **not** create: nested `.vscode/`, `.windsurf/`, nested `node_modules`, app-local `eslint.config.mjs`, or app-local `vitest.workspace.ts`. Root configs are authoritative.

## 2. Creation order

Follow this order strictly. Each step depends on the previous one being correct.

1. `package.json` and `tsconfig.json` (wire the app into pnpm workspaces and TS project references).
2. Root [`tsconfig.json`](../../tsconfig.json): add `{ "path": "./apps/<id>" }` to `references`.
3. `run/config.ts`, `run/brief.ts`, `run/app/create-clients.ts`, `run/app/parse-run-options.ts`, `run/app/input/bootstrap-brief.ts` — static app bootstrap.
4. `run/pipeline/types.ts` (state, services, context extras, artifacts types).
5. `run/pipeline/declaration.ts` (loaders from `@org/pipeline-node/declarations`).
6. `run/pipeline/Gogol.ts` (app-local alias over shared `PipelineStep<PipelineContext>`).
7. `run/pipeline/build-types.ts` (build context + member union types).
8. `run/pipeline/phases/AppPhase.ts` (app phase base extending `PipelinePhase` + `createDeclaredPhaseOptions`).
9. `run/pipeline/context/create-context.shared.ts` and `create-context.ts` (ctx factory).
10. `run/pipeline/engine.ts` (thin wrapper over `runNodePipelineEngine`).
11. `run/pipeline/artifact-validators.ts` (domain-agnostic validators; prefer shared helpers first).
12. `run/pipeline-definition/en/pipeline.md` (top-level phase list).
13. `run/pipeline-definition/en/phases/*.md` (one per phase).
14. `run/pipeline-definition/en/gogols/*.md` (one per gogol).
15. `run/gogols/*.ts` (concrete classes, **thin**).
16. `run/pipeline/gogol-registry.ts` (id → gogol instance).
17. `run/pipeline/phase-registry.ts` (phase ids → phase instances).
18. `run/pipeline.ts` (loads declarations, assembles phases, calls `definePipeline`).
19. `run/main.ts`, `run/run.ts` (entrypoint).
20. `run/prompts/*.md` and `run/templates/<gogol-id>/*.hbs` (co-authored with gogols, not after).
21. `README.md` at the app root.

Never skip ahead and create concrete gogol classes before their declarations exist.

## 3. `package.json` template

```json
{
  "name": "@org/<id>",
  "type": "module",
  "scripts": {
    "build": "pnpm --dir ../.. exec tsc -p apps/<id>/tsconfig.json --noEmit",
    "lint": "pnpm --dir ../.. exec eslint apps/<id>/run --ext .ts",
    "typecheck": "pnpm --dir ../.. exec tsc -p apps/<id>/tsconfig.json --noEmit",
    "dev": "tsx watch run/main.ts",
    "start": "tsx run/main.ts",
    "start:and:build": "pnpm run build && pnpm run start",
    "upgrade-packages": "pnpm up --latest"
  },
  "dependencies": {
    "@org/pipeline-ai": "workspace:*",
    "@org/pipeline-core": "workspace:*",
    "@org/pipeline-node": "workspace:*",
    "@org/pipeline-steps": "workspace:*",
    "@types/node": "^25.7.0",
    "dotenv": "^17.4.2",
    "gray-matter": "^4.0.3",
    "handlebars": "^4.7.9",
    "tsx": "^4.21.0"
  }
}
```

Add provider SDKs only for providers the app actually calls (`openai`, `@google/genai`, `@anthropic-ai/sdk`, etc.). Do not import a provider SDK the app does not use.

## 4. `tsconfig.json` template (mandatory `paths` block)

TypeScript `paths` must list every `@org/pipeline-*` subpath the app imports. Without this, `noEmit` typecheck under Turborepo fails. Copy from [`apps/site/tsconfig.json`](../../apps/site/tsconfig.json) and adjust the app name.

Required shape:

```json
{
  "extends": "../../tsconfig.base.json",
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "lib": ["ESNext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "paths": {
      "@org/pipeline-ai": ["../../packages/pipeline-ai/src/index.ts"],
      "@org/pipeline-ai/json": ["../../packages/pipeline-ai/src/lib/normalize-ai-json.ts"],
      "@org/pipeline-ai/openai": ["../../packages/pipeline-ai/src/lib/openai.ts"],
      "@org/pipeline-core": ["../../packages/pipeline-core/src/index.ts"],
      "@org/pipeline-core/phase": ["../../packages/pipeline-core/src/lib/pipeline-phase.ts"],
      "@org/pipeline-core/step": ["../../packages/pipeline-core/src/lib/pipeline-step.ts"],
      "@org/pipeline-steps": ["../../packages/pipeline-steps/src/index.ts"],
      "@org/pipeline-node": ["../../packages/pipeline-node/src/index.ts"],
      "@org/pipeline-node/fs": ["../../packages/pipeline-node/src/lib/create-node-pipeline-fs.ts"],
      "@org/pipeline-node/context": ["../../packages/pipeline-node/src/lib/create-node-pipeline-context.ts"],
      "@org/pipeline-node/ai": ["../../packages/pipeline-node/src/lib/ai-helpers.ts"],
      "@org/pipeline-node/declarations": ["../../packages/pipeline-node/src/lib/pipeline-declarations.ts"],
      "@org/pipeline-node/engine": ["../../packages/pipeline-node/src/lib/run-node-pipeline-engine.ts"],
      "@org/pipeline-node/env": ["../../packages/pipeline-node/src/lib/env.ts"],
      "@org/pipeline-node/frontmatter": ["../../packages/pipeline-node/src/lib/frontmatter.ts"],
      "@org/pipeline-node/types": ["../../packages/pipeline-node/src/lib/node-pipeline-types.ts"],
      "@org/pipeline-node/prompts": ["../../packages/pipeline-node/src/lib/prompt-files.ts"],
      "@org/pipeline-node/input-validation": ["../../packages/pipeline-node/src/lib/input-validation.ts"],
      "@org/pipeline-node/templates": ["../../packages/pipeline-node/src/lib/template-files.ts"]
    },
    "types": ["node"],
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["run/**/*.ts", "run/**/*.d.ts"],
  "exclude": ["node_modules", "**/dist/**", "**/build/**", "spec/**", ".input", ".output"],
  "references": [
    { "path": "../../packages/pipeline-steps" },
    { "path": "../../packages/pipeline-node" },
    { "path": "../../packages/pipeline-ai" },
    { "path": "../../packages/pipeline-core" }
  ]
}
```

After writing this file, add `{ "path": "./apps/<id>" }` to the root [`tsconfig.json`](../../tsconfig.json) `references` array.

## 5. Runtime bootstrap layer

Derive from `apps/site` verbatim, adjusting only:

- `run/config.ts` — `inputDir`, `outputRootDir`, `promptsDir` (computed from `import.meta.url`, no absolute paths).
- `run/brief.ts` — the **required** `outputLanguage` field plus app-specific fields. Parse with `gray-matter`. Keep `skipGogols` as a supported feature from the start.
- `run/app/create-clients.ts` — instantiate only the providers the app actually uses; read keys via `getRequiredEnv` from `@org/pipeline-node/env` (never `process.env.XYZ` directly).
- `run/app/parse-run-options.ts` — parse `process.argv`. Start with an empty object; add flags only when a gogol actually needs them.
- `run/app/input/bootstrap-brief.ts` — must raise `PipelinePauseError` with an inline brief template when `.input/brief.md` is missing, empty, or invalid.
- `run/main.ts` — catches `PipelinePauseError` (exit code `2`) separately from other errors (exit code `1`). Calls `formatPipelinePaused` / `formatPipelineError`.
- `run/run.ts` — a single `import './main';` line. Do not add logic here.

## 6. Declaration loaders (`run/pipeline/declaration.ts`)

Use `createPipelineDeclarationLoaders` from `@org/pipeline-node/declarations`. Never reimplement markdown frontmatter parsing or member-resolution caching — those belong in `packages/pipeline-node`. Re-export only the helpers the app needs.

Set `configMode: 'nested'` unless the app has a specific reason to deviate. Keep `PIPELINE_DECLARATION_LANGUAGE = 'en'` — operator-facing declaration text is always English even when the pipeline produces non-English content (the output language comes from `brief.md`).

## 7. Typing the pipeline context (`run/pipeline/types.ts`)

The app context is `NodePipelineContext<PipelineState, PipelineAiServices> & PipelineContextExtras`. The extras layer exposes app-friendly names (`getGogolOutputDir`, `readGogolArtifactText`, …) that alias the shared `getStepOutputDir`, `readStepArtifactText`, etc. This aliasing is the only place where "gogol" ↔ "step" vocabulary crosses over.

`PipelineState` must declare every field a gogol will read from `ctx.state`. No `any`, no `Record<string, unknown>`. A downstream gogol that needs a value that the current state does not declare is a contract violation — extend the state first, then write the gogol.

## 8. Declarations are the source of truth

- Write `pipeline.md` → `phases/*.md` → `gogols/*.md` **before** writing any gogol TypeScript class. No exception. See [.agents/prompts/generate-declarations.md](../prompts/generate-declarations.md) for templates and validation checklists.
- Every top-level member in `pipeline.md` must be a phase id. Gogols cannot appear at the top level.
- Every member id inside a phase must resolve to either another phase or a gogol declaration file that exists.
- `factory` in a gogol declaration must match a factory name registered in `run/pipeline/gogol-registry.ts`.
- `decisionType: human_confirms` or `client_chooses` gogols must rely on shared human-gate abstractions from `@org/pipeline-steps` (`WaitHumanStep`, etc.), not bespoke pause logic.
- Step numbering comes from the **flattened declaration order** of gogols. Keep phase and gogol ids stable once published; changing order renumbers output directories and breaks operator continuity.

## 9. Concrete gogols (`run/gogols/*.ts`)

- Each file defines one class named `<PascalCase>Gogol` whose `id` is the kebab-case form.
- Extend the app-local `Gogol` base (which itself extends shared `PipelineStep<PipelineContext>` from `@org/pipeline-core/step`). Do **not** extend `PipelineStep` directly in an app file.
- Declare `artifacts` with typed validators. Prefer shared validators (e.g. `validateMarkdown`, `validateJsonWithArray`) over hand-rolled ones.
- Implement `validateBeforeStart(ctx)` for any gogol with prerequisites. This must fail before the engine creates `.output/N-<gogolId>/`.
- `run(ctx)` must:
  - Use `ctx.getGogolArtifactPath(...)` / `this.getArtifactPath(ctx, ...)` for all paths — never `path.join(ctx.outputDir, ...)` with a literal step directory.
  - Use `ctx.readGogolArtifactText/Json/Buffer` for upstream reads — never reconstruct paths to another gogol's output.
  - Route AI calls through `ctx.createOpenAiJson`, `ctx.createOpenAiText`, and equivalents. These log metadata + full response to `AI/ai-<k>/` automatically.
  - For idempotent template-driven artifacts, use `writeGogolTemplateArtifactsIfMissing` from the app `utils.ts` (which wraps `@org/pipeline-node/templates`).
- Operator-facing text lives in the gogol declaration markdown, **not** in the TS class. The only TS-level narrative allowed is a single-line comment explaining non-obvious idempotency or routing choices.

## 10. Registries (`run/pipeline/gogol-registry.ts`, `phase-registry.ts`)

Two valid registry styles — pick one and stay consistent within the app:

- **`simpleFactories` record** (preferred for greenfield): map `factory` string → `() => new Gogol()`. See [`apps/site/run/pipeline/gogol-registry.ts`](../../apps/site/run/pipeline/gogol-registry.ts).
- **`switch` on `declaration.factory`**: required only when factories need parameterized config from the declaration (`conceptIndex`, `circleNumber`, `requiredOutputFiles`, …). See [`apps/inticle/run/pipeline/gogol-registry.ts`](../../apps/inticle/run/pipeline/gogol-registry.ts).

In both styles, every gogol instance must go through `withGuide(...) = gogol.withExplanation(toGogolGuideSeed(declaration))` so the runtime guide stays aligned with declaration markdown.

The phase registry maps phase ids to `AppPhase` subclasses. Keep it a single `phaseFactories` record typed with `satisfies Record<string, (ctx: PipelineBuildContext) => PipelinePhase<AppStep>>`. One `AppPhase` subclass per phase id is fine when there is no per-phase behavior; a single reusable `SitePhase extends AppPhase` (as in `apps/site`) is also fine.

## 11. `run/pipeline.ts`

Must stay thin. Its only responsibilities:

1. Load the pipeline declaration via `loadPipelineDeclaration`.
2. Build the `PipelineBuildContext` (brief, language, per-app extras).
3. Resolve enabled top-level members via `resolveEnabledMemberIds` (only needed if the app uses `whenFeature`).
4. Map top-level member ids to phases through `createPhaseById`.
5. Return `definePipeline({ title, summary, quickStart, operatingRules, phases })`.

No imperative step arrays. No `new ConcreteGogol()` calls. No app-local route branching outside `createPipelineRoute` / `createRoutingFeatureFlags` helpers.

## 12. Post-scaffold verification

From the monorepo root, in this order:

```bash
pnpm install
pnpm turbo run build --filter=@org/pipeline-core --filter=@org/pipeline-node --filter=@org/pipeline-ai --filter=@org/pipeline-steps
pnpm turbo run typecheck --filter=@org/<id>
pnpm turbo run lint --filter=@org/<id>
pnpm turbo run start --filter=@org/<id>
```

The first `start` run must produce `.output/_guide/start-here.md` and pause gracefully at the first blocking gate (missing `.input/` materials, unimplemented prompt, etc.). If it crashes with an unrelated error, the bootstrap layer is incomplete.

## 13. Anti-patterns (do not do any of these)

- Copying `Gogol.ts`, `AppPhase.ts`, `engine.ts`, `declaration.ts`, `create-context.shared.ts`, or validators from another app without a concrete reason. If a helper is reusable, promote it to `packages/*` instead.
- Writing a flat `steps: [...]` array in `run/pipeline.ts`.
- Calling `JSON.parse` directly on LLM output. Always go through `createOpenAiJson` or `parseAiJson` from `@org/pipeline-ai`.
- Hand-rolling AI logging (writing prompts/responses manually to `ai-<k>/`). Always use `createLoggedOpenAiHelpers` / `createLoggedAnthropicHelpers`.
- Hardcoding upstream paths like `path.join(ctx.outputDir, '5-classify-client', 'profile.md')`. Always use `ctx.readGogolArtifactText('classify-client', 'profile')`.
- Creating `.output/N-<gogolId>/` before `validateBeforeStart` passes. The shared engine already enforces this — do not override it.
- Nested `.vscode/`, `.windsurf/`, `node_modules/`, `.env.sample` overriding root behavior, or app-local `eslint.config.mjs`.
- Using `process.env.XYZ` directly. Always go through `getRequiredEnv` from `@org/pipeline-node/env`.
- Adding a new npm dependency when an equivalent lives in `packages/*` or is already a transitive dependency of a shared package.
- Using `pnpm nx ...`, `npx nx ...`, or any Nx command. This monorepo is Turborepo only.

## 14. Related references

- Root [`AGENTS.md`](../../AGENTS.md) — monorepo scope, terminology, runtime data contract.
- [`apps/AGENTS.md`](../../apps/AGENTS.md) — required app layout and runtime contract.
- [`packages/AGENTS.md`](../../packages/AGENTS.md) — where shared code belongs.
- [`.agents/rules/pipeline-apps.md`](pipeline-apps.md) — phase and gogol design deep-dive.
- [`.agents/rules/migration-guide.md`](migration-guide.md) — migrating an imperative legacy pipeline into this architecture.
- [`.agents/prompts/generate-declarations.md`](../prompts/generate-declarations.md) — declaration frontmatter templates.
- [`.agents/prompts/transform-code.md`](../prompts/transform-code.md) — transformation patterns for gogol classes, AI calls, state, and registries.
- [`.agents/prompts/analyze-legacy-pipeline.md`](../prompts/analyze-legacy-pipeline.md) — phase detection from legacy source.
