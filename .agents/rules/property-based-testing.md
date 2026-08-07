# Property-based testing guidance

Scope: all `packages/*` and `apps/*` test files. Use this file to decide when to add property-based tests (PBT) alongside existing example-based tests.

## When to use PBT

Use `fast-check` (already a devDependency in eligible packages) when the function or class under test satisfies **at least one** of these criteria:

- **Pure function with an algebraic invariant** — determinism, idempotency, injectivity, commutativity, or order-independence. Examples: `sha256Json` (key-order independence), `slugify` (idempotency, character-class constraint), `deriveAssetId` (determinism + injectivity).
- **Stateful object with a conservation law** — a quantity that must stay within bounds regardless of operation sequence. Example: `TokenBucket.available()` must never exceed `size` and never go negative, regardless of `tryAcquire` call patterns and time advancement.
- **Round-trip property** — `decode(encode(x)) === x` or `read(write(x)) === x`. Example: emit-bundle writer → reader round-trip with hash verification.

## When NOT to use PBT

Do **not** add PBT for:

- **Pipeline gogols** — LLM orchestration, file I/O side-effects, DB migrations. No algebraic invariants; example-based contract tests are the right tool.
- **Prompt engineering / content generation** — output is non-deterministic and judged by quality, not by formal properties.
- **Framework plumbing** — `pipeline-core`, `pipeline-node`, `pipeline-ai`, `pipeline-steps` are DI/I/O containers. PBT here gives no ROI over integration tests.
- **Trivial wrappers** — if the function is a one-line pass-through to a library that is already tested upstream, PBT adds noise.

## How to write PBT in this monorepo

- Use `fast-check` with `vitest` — no separate runner needed. Call `fc.assert(fc.property(...))` inside `it(...)` blocks.
- Name files `*.property.test.ts` (or `*.property.spec.ts` in `packages/strings`) to distinguish from example-based tests.
- **Keep existing example-based tests** — they serve as readable contract documentation. PBT complements them, it does not replace them.
- Limit `numRuns` for async properties that do file I/O (e.g. `25`–`50` runs for temp-dir round-trip tests).
- Create fresh temp directories inside the property body, not in `beforeEach` — `fc.assert` runs the predicate many times within a single `it` block.
- `fc.asyncProperty` requires at least one arbiter. Use `fc.constant(null)` when no input is needed.
- Prefer `fc.pre(...)` to filter inputs inside the property rather than constructing overly narrow arbitraries.

## Eligible packages

`fast-check` is a devDependency in:

- `packages/observatory/observatory-core` — hashing, IDs, observation builders.
- `packages/strings` — slugify, capitalize, normalize-url.
- `packages/rate-limit` — token bucket, circuit breaker, retry logic.
- `packages/observatory/observatory-emit` — emit-bundle writer/reader round-trip, manifest schema.

When adding `fast-check` to a new package, follow the dependency-first rule from root `AGENTS.md`: prefer the npm package over a hand-rolled generator. `fast-check` is ~50 KB, no native binaries, actively maintained.
