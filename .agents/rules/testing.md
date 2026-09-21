# Testing standards for packages and apps

Scope: all `packages/*` (except `axiom-*`) and `apps/*`. This file defines **what tests to write**, **where to put them**, and **how to structure them**. For PBT-specific guidance see [`property-based-testing.md`](property-based-testing.md).

## Test location convention

- **All test files live in `src/tests/`** inside the package or app directory.
- Never place test files alongside source files (`src/lib/*.test.ts`, `src/*.test.ts`).
- Never use `__tests__/` directories. If you encounter legacy test files outside `src/tests/`, move them and fix imports.
- Test fixtures (golden files, seed data) live in `src/tests/__fixtures__/`, co-located with the tests that consume them.
- File naming:
  - `*.test.ts` — standard unit and integration tests.
  - `*.property.test.ts` — property-based tests using `fast-check`.
  - `*.spec.ts` — allowed in `packages/strings` for historical consistency; new packages should use `*.test.ts`.
  - `*.integration.test.ts` — tests that touch real I/O (DuckDB, Parquet, temp filesystem).

## Vitest configuration

- Every package with tests must have a `vitest.config.ts` (or `vite.config.ts` with a `test` block) at the package root.
- Every `vitest.config.ts` must include `resolve.conditions: ["@syrokomskyi/source"]` so workspace packages resolve from source during test runs.
- Standard `include` pattern: `["src/**/*.test.ts"]` (or `["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"]` for packages using `.spec.ts`).
- The `test` script in `package.json` is always `"test": "pnpm exec vitest run"`.
- Add `"vitest"` to `devDependencies` if not already present.
- The root `vitest.workspace.ts` auto-discovers all config files — never add per-package entries to it.

## What to test in each package category

### Pure utility packages (`strings`, `utils`, `changelog-live`)

- **Unit tests** for every exported function: edge cases, empty input, type validation, real-world examples.
- **Property-based tests** when algebraic invariants exist (idempotency, character-class constraints, determinism). See [`property-based-testing.md`](property-based-testing.md).
- Coverage target: every exported function has at least one test.

### Pipeline framework packages (`pipeline-core`, `pipeline-node`, `pipeline-ai`, `pipeline-steps`)

- **Unit tests** for public API surface: pipeline/phase/step constructors, guide generation, error classes, validator helpers.
- **Integration tests** for I/O helpers: file read/write round-trips, template rendering, frontmatter parsing.
- Mock external providers (OpenAI, Anthropic) — never make real API calls in unit tests. Use `vi.fn()` for logger and provider interfaces.
- For abstract step classes (`RateLimitedHttpStep`, `KAnonymityGateStep`, etc.), test via minimal concrete subclasses.
- Do **not** add PBT to framework plumbing — example-based tests are the right tool here.

### Domain packages (`business-core`, `business-crawler`, `hdri-codebook`, `factory-core`, `image-vectorizer`, `brand-inticle`)

- **Unit tests** for domain logic: normalization rules, ID generation, scoring formulas, path helpers, text processors.
- **Contract tests** for parsers and extractors: feed known HTML/JSON input, assert structured output.
- Test edge cases specific to the domain: German-language content, URL variants, empty/missing fields.

### Observatory packages (`observatory-core`, `observatory-crypto`, `observatory-emit`, `observatory-vault`)

- **Unit tests** for crypto primitives: canonicalization, signing, verification, key registry trust evaluation.
- **Property-based tests** for hashing determinism, ID generation, and emit-bundle round-trip integrity.
- **Integration tests** for vault I/O: real DuckDB Parquet writes and reads against temp directories.
- Test fixtures (golden manifests, signed observation samples) in `src/tests/__fixtures__/`.
- Integration tests that use DuckDB may need longer timeouts — set `testTimeout: 15_000` in `vitest.config.ts`.

### Rate-limit package (`rate-limit`)

- **Unit tests** for each algorithm: token bucket, concurrency gate, circuit breaker, retry logic.
- **Property-based tests** for conservation laws (bucket never overflows, never goes negative) and state transitions.
- Use the `Clock` seam (`now`/`setTimeout`/`random`) for deterministic time-dependent tests — never use real timers.

## Test patterns and conventions

### Imports

- Always `import { describe, it, expect, vi, ... } from "vitest"`.
- Never import from `node:test` or `node:assert`.
- Relative imports from `src/tests/` to source: `../lib/module.js` (one level up from `tests/` to `src/`, then into the source subdirectory).
- For packages where source is directly in `src/` (not `src/lib/`): `../module.js`.

### Temp files and cleanup

- Use `fs.mkdtempSync(path.join(os.tmpdir(), "prefix-"))` for temp directories.
- Always clean up in `afterEach` with `fs.rmSync(dir, { recursive: true, force: true })`.
- On Windows, `rmSync` can fail with EPERM if file handles are still open. Wrap cleanup in a retry loop (3 attempts) for robustness.

### Timeouts

- Root `pnpm test` limits Turbo to four concurrent package tasks. Each Vitest process may create its own worker pool, so raising package-level concurrency can oversubscribe CI and cause false timeout failures.
- Default Vitest timeout is 5000ms. In Vitest 4, increase it with the options object as the second argument: `it("name", { timeout: 30_000 }, () => { ... })`.
- Tests making real API calls must have explicit timeouts and skip when the API key is missing.
- PBT tests with `fc.webUrl()` or other expensive arbitraries may need 15s timeout.
- Integration tests with DuckDB may need package-level `testTimeout: 15_000` in `vitest.config.ts`.

### Mocking

- Use `vi.fn()` for mock functions. Use `vi.spyOn(console, "error").mockImplementation(() => {})` to suppress expected error output.
- Mock `AiLogger` interface with `vi.fn(async () => ...)` for each method.
- When mocking `TokenUsage`, include all three fields: `promptTokens`, `completionTokens`, `totalTokens`.
- When constructing `PipelineAiLogOptions`, use `userPrompts: string[]` — not `prompt` or `stepId` (those fields do not exist on the type).

### What not to test

- **Do not test** third-party library behavior that is already tested upstream (e.g. Zod schema parsing internals, Handlebars template engine).
- **Do not test** type-only exports — TypeScript compiler validates these.
- **Do not test** app-local prompt text or declaration markdown — these are configuration, not code.
- **Do not add PBT** to pipeline gogols, prompt engineering, or framework plumbing. See [`property-based-testing.md`](property-based-testing.md).

## Build integration

- Test files must be excluded from the build `tsconfig.json` via `"exclude": ["**/*.test.ts", "**/*.spec.ts"]` so `tsc --noEmit` skips them.
- Test files must not be imported by production source code.
- `vitest.config.ts` itself is not compiled — it runs via `tsx`/`vitest` directly.
