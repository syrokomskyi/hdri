# @syrokomskyi/rate-limit

Token-bucket, concurrency gate, circuit-breaker, and retry algorithms for mass crawling and external API calls.

## Modules

- **`Clock`** (`clock.ts`) — unified time-injection seam. All time-dependent modules accept the same `Clock` interface (`now`, `setTimeout`, `random`). Inject a `TestClock` (from `tests/test-clock.ts`) for deterministic testing.
- **`TokenBucket`** — classic token-bucket with async waiters, FIFO fairness, fractional refill. Observability via `onAcquire(remaining, cost)` and `onQueue(waiters)`.
- **`ConcurrencyGate`** — caps in-flight tasks, FIFO queue. Observability via `onAcquire(inFlight)` and `onRelease(inFlight, queueDepth)`.
- **`CircuitBreaker`** — three-state (closed → open → half-open) with rolling failure window and injectable `Clock`.
- **`retry()`** — exponential backoff with full jitter. Accepts `Clock` for sleep/random derivation. `NonRetryableError` is never retried by the default `shouldRetry` predicate.
- **`RateLimiter`** — composition module. Wires gate → bucket → breaker → retry into one `schedule(fn)` call. Accepts a shared `Clock` and exposes a unified `onEvent` observer receiving events from all sub-modules.

## Usage

```ts
import { RateLimiter } from "@syrokomskyi/rate-limit";

const limiter = new RateLimiter({
  concurrency: 4,
  bucket: { size: 10, refillPerSec: 2 },
  breaker: { threshold: 5, cooldownMs: 10_000 },
  retry: { retries: 3, baseDelayMs: 200 },
  onEvent: (e) => console.log(e.type),
});

const result = await limiter.schedule(() => fetch(url));
```

## Testing

All tests use `TestClock` from `tests/test-clock.ts` — a deterministic clock with manual `advance(ms)` and `setNow(ms)`.

```bash
pnpm --filter @syrokomskyi/rate-limit test
```

## Changelog

[CHANGELOG.md](CHANGELOG.md)
