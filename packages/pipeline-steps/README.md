# @org/pipeline-steps

Reusable abstract **step base classes** extracted from recurring patterns
across the pipeline apps. Each class encapsulates one cross-cutting
concern (rate limiting, browser pooling, cross-DB reads, DSGVO k-anonymity,
human pauses) so consumer gogols can focus on business logic.

> **When not to use:** if a step does a simple, self-contained thing (e.g.
> `SetupAuditDbGogol`), keep extending your app's local `Gogol` class. These
> base classes are for the gnarly, duplicate-on-each-app patterns.

---

## Dispatch table — which base class do I need?

| Your gogol… | Use | Why |
|---|---|---|
| …calls a 3rd-party HTTP API with per-host / per-key rate limits | **`RateLimitedHttpStep`** | token-bucket + circuit breaker + retry wrapped in one `this.schedule(fn)` |
| …drives a headless browser (Playwright) | **`PlaywrightPooledStep`** | concurrency-gated `withBrowser` / `withPage`; browser is a peer dep |
| …reads an upstream pipeline's SQLite DB (`*.db`) read-only | **`CrossDbReadOnlyStep`** | `{ readonly: true }` + WAL + FK pragmas + streaming SHA-256 + auto-close |
| …publishes data derived from human subjects (DSGVO) | **`KAnonymityGateStep`** | `enforceKAnonymity(ctx)` — warn or enforce with per-stratum report.json |
| …needs a synchronous manual signoff (codebook, Beirat) | **`WaitHumanStep`** | polls for an approval artifact, writes a pause marker |
| …stops the pipeline unconditionally until a human resumes it | **`PausePipelineStep`** | thin wrapper; no side effects beyond the pause marker |

---

## `CrossDbReadOnlyStep` — two patterns

The base class exposes `this.withReadOnlyDbs(fn)` + `this.openReadOnly(name, path)`.
**Prefer the return-value form:**

```ts
// GOOD — return-value form. Type flows naturally.
const scratch = await this.withReadOnlyDbs(async () => {
  const scoresDb = this.openReadOnly('scoresDb', scoresPath);
  const rows = scoresDb.prepare('SELECT ...').all();
  return { rows };
});
// scratch.rows is typed; scoresDb is already closed.
```

**Avoid** capturing into an outer `let` from inside the async callback —
TypeScript can't narrow it after the `await`, and you'll end up casting:

```ts
// BAD — forces `as unknown as ... | null` casts later.
let scratch: Scratch | null = null;
await this.withReadOnlyDbs(async () => {
  scratch = { ... };
});
```

`openReadOnly` throws at runtime if called outside `withReadOnlyDbs` —
prevents DB leaks.

After the callback returns, `this.inputHashes` contains SHA-256 hex of each
opened file (streaming, safe for multi-GB DBs). Feed these to your MANIFEST
or `pipeline_inputs` row for reproducibility.

---

## `RateLimitedHttpStep` — usage

Concrete class provides `getRateLimitOptions()`. The base wraps every call to
`this.schedule(fn)` with the gate → bucket → breaker → retry chain from
`@org/business-rate-limit`.

```ts
export class FetchHdriGogol extends RateLimitedHttpStep<PipelineContext> {
  override readonly id = 'fetch-hdri';
  override getRateLimitOptions() {
    return { tokensPerInterval: 10, intervalMs: 1000, maxConcurrent: 4 };
  }
  override async run(ctx: PipelineContext) {
    for (const site of ctx.state.sites) {
      await this.schedule(() => fetch(site.url));
    }
  }
}
```

Inspect at runtime: `this.inFlight()`, `this.queueDepth()`.

---

## `PlaywrightPooledStep` — usage

`playwright` is a **peer dependency** — loaded via dynamic import so this
package stays install-light. If the consuming app hasn't installed it, the
step fails loudly at runtime (not at type-check).

```ts
await this.withPage(async (page) => {
  await page.goto(url);
  return await page.title();
});
```

Global concurrency is governed by a single `ConcurrencyGate`; override
`getMaxConcurrentPages()` to change it.

---

## `KAnonymityGateStep` — usage

Override `collectStrata(ctx)` to return a list of `Stratum` objects
(groups of records whose publication would identify fewer than K_MIN people).
`enforceKAnonymity(ctx)` returns `KAnonymityOutcome` — a report plus
`passedStrataKeys` and `failedStrataKeys`. Behavior depends on mode:

- `warn` (default): logs failures, returns the outcome; consumer code must
  filter suppressed strata out of the publication payload.
- `enforce`: throws on any failing stratum — pipeline halts.

Default `K_MIN = 5` (exported as `DEFAULT_K_MIN`). Always writes
`report.json` to `getOutputDir(ctx)` for audit.

---

## Adding a new step base class

1. Extract only when the **same** 15+ lines appear in ≥ 2 apps.
2. Put it in `src/lib/<name>-step.ts`, export from `src/index.ts`.
3. Keep external deps as peer deps; consume via `createRequire` (CJS) or
   dynamic `import('…' as string)` (ESM) so install stays light.
4. Document the dispatch row in this README.
5. Migrate the consumer gogols in the same PR — no orphan base classes.

---

## Peer dependencies

- `better-sqlite3` — `CrossDbReadOnlyStep`
- `playwright` — `PlaywrightPooledStep`
- `@org/business-rate-limit` — `RateLimitedHttpStep` (workspace dep, already in package.json)

The root `pnpm-workspace.yaml` lists `better-sqlite3` in `onlyBuiltDependencies`
so native builds happen once at install time.
