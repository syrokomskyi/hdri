# Transform Legacy Code to Phase-Driven Architecture

Use this template when transforming legacy pipeline code to the new architecture.

Scope: applies to `apps/*`. Prefer shared helpers from `@org/pipeline-core`, `@org/pipeline-node`, `@org/pipeline-ai`, and `@org/pipeline-steps` over app-local reimplementations.

## Transformation Order

1. Create app structure (`apps/[name]/`).
2. Generate declarations (`pipeline.md`, `phases/*.md`, `gogols/*.md`).
3. Create registries (`phase-registry.ts`, `gogol-registry.ts`).
4. Transform gogol classes.
5. Create thin `run/pipeline.ts` orchestrator.
6. Migrate prompts and utilities.
7. Validate and test.

## Pattern: Gogol Class Transformation

The app-local `Gogol` base class is the concrete alias used inside apps. It extends `PipelineStep<PipelineContext>` from `@org/pipeline-core/step`. Do not invent names like `PipelineGogol` — the canonical app-local alias is `Gogol` (see [apps/site/run/pipeline/Gogol.ts](apps/site/run/pipeline/Gogol.ts)).

### Legacy Pattern
```typescript
class LegacyStep {
  async run(context: LegacyContext) {
    const input = fs.readFileSync(path.join(context.inputDir, 'file.txt'));
    const result = await processData(input);
    fs.writeFileSync(path.join(context.outputDir, 'output.txt'), result);
  }
}
```

### New Pattern
```typescript
import { Gogol } from '../pipeline/Gogol';
import type { GogolArtifacts, PipelineContext } from '../pipeline/types';

export class TransformedGogol extends Gogol {
  override readonly id = 'transformed-step';

  override readonly artifacts = {
    output: { kind: 'file', relativePath: 'output.txt' },
  } satisfies GogolArtifacts;

  override async run(ctx: PipelineContext): Promise<void> {
    const input = await ctx.readInputTextFile('file.txt');

    const result = await processData(input);

    const outputPath = this.getArtifactPath(ctx, 'output');
    await ctx.writeTextFile(outputPath, result);
  }
}
```

**Key changes:**
- Extend the app-local `Gogol` (which extends `PipelineStep<PipelineContext>`).
- Mark `id` and `artifacts` with `override readonly`.
- Define `artifacts` with a typed structure validated via `satisfies GogolArtifacts`.
- Use `ctx` helpers instead of direct `fs` operations.
- Use `this.getArtifactPath(ctx, artifactId)` for outputs; the app-local `Gogol` delegates to `ctx.getGogolArtifactPath(...)`.
- Use `async/await` consistently.

## Pattern: AI Call Migration

Prefer shared helpers from `@org/pipeline-ai` and logging-aware runtime adapters from `@org/pipeline-node/ai` (for example `createLoggedOpenAiHelpers(...)`). Never hand-roll provider HTTP calls or reinvent the `AI/ai-<k>/` logging layout.

### Legacy Pattern
```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': apiKey },
  body: JSON.stringify({ model: '<legacy-model-name>', messages: [...] }),
});
const json = JSON.parse(await response.text());
```

### New Pattern — Anthropic text
```typescript
import { createAnthropicAiText } from '@org/pipeline-ai';

const result = await createAnthropicAiText({
  client: ctx.ai.anthropic,
  model: '<model>',
  systemPrompt: '...',
  userPrompts: ['...'],
  temperature: 0.7,
});
// Already logged to AI/ai-<k>/ through the shared logging-aware helper contract.
```

### New Pattern — OpenAI JSON
```typescript
import { createOpenAiJson } from '@org/pipeline-ai';

const result = await createOpenAiJson<ResultShape>({
  client: ctx.ai.openai,
  model: '<model>',
  systemPrompt: '...',
  userPrompts: ['...'],
});
// Parsed and validated through shared helpers; do not chain createOpenAiText + parseAiJson manually.
```

**Key changes:**
- Use shared AI helpers from `@org/pipeline-ai`; do not embed model strings unless the step truly pins a specific version — use `<model>` placeholders in templates.
- When the step expects JSON, prefer `createOpenAiJson(...)` over `createOpenAiText(...) + parseAiJson(...)`.
- Route provider calls through the context's logging-aware helper set (for example built by `createLoggedOpenAiHelpers(...)`) so every call emits a consistent `AI/ai-<k>/` directory with request and response artifacts.
- Do not reinvent JSON parsing, retry, or logging inside the app.

## Pattern: State Management

### Legacy Pattern
```typescript
class LegacyContext {
  state: Map<string, any> = new Map();
}

step1.run(context);
context.state.set('brief', brief);
step2.run(context);
const brief = context.state.get('brief');
```

### New Pattern
```typescript
// In producer gogol:
ctx.state.brief = brief;

// In downstream gogol:
const brief = ctx.state.brief;
if (!brief) {
  throw new Error('Missing brief in pipeline state');
}
```

**Key changes:**
- Use typed state properties instead of an untyped `Map`.
- Validate required state at step start in `validateBeforeStart(ctx)`; fail fast before the engine creates a fresh `.output/N-<gogolId>/` directory.
- State is in-memory only. If a gogol supports reuse, restore the minimum required state from declared artifacts when rerun.

## Pattern: Artifact Reading

### Legacy Pattern
```typescript
const upstreamOutput = fs.readFileSync(
  path.join(context.outputDir, 'step-5', 'result.json'),
);
```

### New Pattern
```typescript
const upstreamArtifact = ctx.getGogolArtifactPath('upstream-step-id', 'result');
const upstreamOutput = await ctx.readJsonFile(upstreamArtifact);
```

**Key changes:**
- Use `ctx.getGogolArtifactPath(gogolId, artifactId)` instead of hardcoded paths.
- Reference by gogol id, not by step number.
- Formalize upstream dependencies as declared artifacts on the producer gogol; validate them through shared artifact helpers in `validateBeforeStart(ctx)`.
- Do not keep critical upstream dependencies only as `ctx.outputDir` / `path.join(...)` conventions when the producer can declare artifacts.

## Pattern: Human Gates

Prefer the shared `WaitHumanStep` from `@org/pipeline-steps` over re-implementing pause/wait logic per app. Use `PipelinePauseError` (from `@org/pipeline-core`) only when a gogol has a truly app-specific pause that cannot be expressed by the shared step.

### Legacy Pattern
```typescript
if (!fs.existsSync(approvalFile)) {
  console.log('Waiting for approval...');
  process.exit(0);
}
```

### New Pattern — shared step (preferred)
Declare the gogol with `factory: wait-human` and wire it through the gogol registry:
```typescript
import { WaitHumanStep } from '@org/pipeline-steps';

// In gogol-registry.ts, case 'wait-human' (or equivalent):
return withGuide(
  new WaitHumanStep({
    id,
    requiredOutputFiles: readConfigStringArray(config, 'requiredOutputFiles'),
    message: readConfigString(config, 'message'),
  }),
);
```

### New Pattern — app-specific pause
```typescript
import { PipelinePauseError } from '@org/pipeline-core';

const approvalPath = this.getArtifactPath(ctx, 'approval');
const approved = await ctx.fileExists(approvalPath);

if (!approved) {
  throw new PipelinePauseError(
    [
      `Pipeline paused by ${this.id}.`,
      'Please review the artifacts and create approval.txt',
      `Location: ${ctx.toWorkspaceRelativePath(approvalPath)}`,
    ].join('\n'),
  );
}
```

**Key changes:**
- Prefer `WaitHumanStep` from `@org/pipeline-steps`.
- Use `PipelinePauseError` for app-specific gates.
- Provide clear instructions and print paths relative to the workspace root, never as absolute paths.
- Mark the gogol with `decisionType: human_confirms` (or `client_chooses`) in its declaration.

## Pattern: Registry Creation

### Phase Registry
```typescript
import type { PipelinePhase } from '@org/pipeline-core';
import type { PipelineBuildContext, PipelineMember } from './build-types';
import { createGogolById } from './gogol-registry';
import type { Gogol } from './Gogol';
import { AppPhase } from './phases/AppPhase';

const createPipelineMemberById = (
  id: string,
  context: PipelineBuildContext,
): PipelineMember => {
  return isPhaseId(id)
    ? createPhaseById(id, context)
    : createGogolById(id, context);
};

export class InputReadinessPhase extends AppPhase {
  constructor(buildContext: PipelineBuildContext) {
    super({
      id: 'input-readiness',
      buildContext,
      createMember: (id) => createPipelineMemberById(id, buildContext),
    });
  }
}

const phaseFactories = {
  'input-readiness': (buildContext: PipelineBuildContext) =>
    new InputReadinessPhase(buildContext),
  // ... more phases
} satisfies Record<string, (buildContext: PipelineBuildContext) => PipelinePhase<Gogol>>;

export type PhaseId = keyof typeof phaseFactories;

export const isPhaseId = (id: string): id is PhaseId => id in phaseFactories;

export const createPhaseById = (
  id: PhaseId,
  buildContext: PipelineBuildContext,
): PipelinePhase<Gogol> => phaseFactories[id](buildContext);
```

Prefer shared declaration materialization helpers from `@org/pipeline-node/declarations` (for example `createDeclaredPhaseOptions`) inside `AppPhase` instead of app-local ad hoc glue.

### Gogol Registry — `simpleFactories` record (preferred for greenfield)

Use this pattern when most factories are zero-argument constructors. Models apps/site — see [apps/site/run/pipeline/gogol-registry.ts](apps/site/run/pipeline/gogol-registry.ts).

```typescript
import { CheckInputGogol } from '../gogols/CheckInputGogol';
import { DraftGogol } from '../gogols/DraftGogol';
// ... import all gogol classes
import { WaitHumanStep } from '@org/pipeline-steps';
import {
  loadGogolDeclaration,
  readConfigString,
  readConfigStringArray,
  toGogolGuideSeed,
} from './declaration';
import type { PipelineBuildContext, AppPipelineStep } from './build-types';

const simpleFactories: Record<string, () => AppPipelineStep> = {
  'check-input': () => new CheckInputGogol(),
  draft: () => new DraftGogol(),
  // ... every factory with no declaration-driven parameters
};

export const createGogolById = (
  id: string,
  context: PipelineBuildContext,
): AppPipelineStep => {
  const declaration = loadGogolDeclaration({
    id,
    language: context.declarationLanguage,
  });
  const config = declaration.config;
  const withGuide = <TStep extends AppPipelineStep>(step: TStep): TStep =>
    step.withExplanation(toGogolGuideSeed(declaration));

  // Parameterized factories go before the simpleFactories lookup:
  if (declaration.factory === 'wait-human') {
    return withGuide(
      new WaitHumanStep({
        id,
        requiredOutputFiles: readConfigStringArray(config, 'requiredOutputFiles'),
        message: readConfigString(config, 'message'),
      }),
    );
  }

  const factory = simpleFactories[declaration.factory];
  if (!factory) {
    throw new Error(
      `Unknown gogol factory: ${declaration.factory} (gogol id: ${id})`,
    );
  }

  return withGuide(factory());
};
```

### Gogol Registry — exhaustive `switch` (when every factory reads declaration config)

Use this pattern when most factories need to read parameterized config from the declaration, making the record form noisy. Models apps/inticle.

```typescript
import { loadGogolDeclaration, toGogolGuideSeed } from './declaration';
import type { PipelineBuildContext } from './build-types';
import type { Gogol } from './Gogol';
import { CheckInputGogol } from '../gogols/CheckInputGogol';
import { DraftGogol } from '../gogols/DraftGogol';
// ... import all gogol classes

export const createGogolById = (
  id: string,
  context: PipelineBuildContext,
): Gogol => {
  const declaration = loadGogolDeclaration({
    id,
    language: context.declarationLanguage,
  });
  const config = declaration.config;
  const withGuide = <TGogol extends Gogol>(gogol: TGogol): TGogol =>
    gogol.withExplanation(toGogolGuideSeed(declaration));

  switch (declaration.factory) {
    case 'check-input':
      return withGuide(new CheckInputGogol());
    case 'draft':
      return withGuide(new DraftGogol());
    // ... more cases, often reading from `config`
    default:
      throw new Error(
        `Unknown gogol factory: ${declaration.factory} (gogol id: ${id})`,
      );
  }
};
```

Both forms are valid. Default to `simpleFactories` for new apps; choose `switch` when config-driven construction dominates.

Parse declaration config in the registry layer using `readConfigString`, `readConfigNumber`, `readConfigStringArray`, etc. from the app-local `declaration.ts` (which re-exports shared helpers). Do not spread config parsing across gogol constructors.

## Pattern: `run/pipeline.ts` Orchestrator

Keep `run/pipeline.ts` thin: load declarations, prepare build context, call `definePipeline(...)`. Do not instantiate a long sequence of gogols inside `run/pipeline.ts`.

```typescript
import { definePipeline } from '@org/pipeline-core';
import type { PipelineDefinition } from '@org/pipeline-core';
import type { Brief } from './brief';
import { loadPipelineDeclaration } from './pipeline/declaration';
import { createPhaseById, isPhaseId } from './pipeline/phase-registry';
import type { Gogol } from './pipeline/Gogol';

export const createPipeline = (options: {
  brief: Brief;
}): PipelineDefinition<Gogol> => {
  const brief = options.brief;
  const declarationLanguage = 'en';

  const declaration = loadPipelineDeclaration({ language: declarationLanguage });

  const buildContext = {
    brief,
    declarationLanguage,
    // ... other app-specific build-context fields
  };

  const phases = declaration.members.map((member) => {
    if (!isPhaseId(member.id)) {
      throw new Error(
        `Top-level pipeline member must be a phase id: ${member.id}`,
      );
    }
    return createPhaseById(member.id, buildContext);
  });

  return definePipeline({
    title: declaration.title,
    summary: createExecutionSummary(brief),
    quickStart: declaration.quickStart,
    operatingRules: declaration.operatingRules,
    phases,
  });
};
```

## Validation Checklist

After transformation:

- [ ] All gogol classes extend the app-local `Gogol` (which extends `PipelineStep<PipelineContext>`).
- [ ] All artifacts are declared and validated via `satisfies GogolArtifacts`.
- [ ] All AI calls go through `@org/pipeline-ai` helpers and emit `AI/ai-<k>/` logs via the shared logging-aware helper contract.
- [ ] JSON AI calls use `createOpenAiJson(...)` instead of `createOpenAiText(...) + parseAiJson(...)`.
- [ ] All file I/O uses `ctx` helpers (no direct `fs` operations).
- [ ] All artifact paths go through `this.getArtifactPath(ctx, id)` or `ctx.getGogolArtifactPath(gogolId, id)`.
- [ ] Human gates prefer `WaitHumanStep` from `@org/pipeline-steps`; app-specific pauses use `PipelinePauseError`.
- [ ] All gogols have `withExplanation(toGogolGuideSeed(declaration))` applied in the registry.
- [ ] Phase registry maps all phase ids through a `satisfies Record<...>` factory table.
- [ ] Gogol registry maps all factory names exhaustively (either `simpleFactories` + parameterized branches, or an exhaustive `switch`).
- [ ] `run/pipeline.ts` only loads declarations, prepares build context, and calls `definePipeline(...)`.
- [ ] No hardcoded file paths; printed paths are relative to the workspace root.
- [ ] No direct `JSON.parse` on AI responses.
- [ ] Prerequisites (`.input/*`, upstream artifacts, prompt readiness) are validated in `validateBeforeStart(ctx)` before the engine creates a fresh step output directory.
- [ ] Model strings are either justified and pinned per step, or left as `<model>` placeholders in templates.
