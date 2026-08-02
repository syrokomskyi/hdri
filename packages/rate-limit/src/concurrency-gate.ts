/*
<MODULE_CONTRACT>
<purpose>Manages concurrent execution by allowing a specified number of tasks to run simultaneously, enforcing a FIFO order for queued tasks.</purpose>
<non-goals>
  <item>Does not manage task prioritization beyond FIFO order.</item>
  <item>Does not handle task cancellation or timeout.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the concurrency gate with FIFO task management.</item>
  <item>Added optional onAcquire/onRelease observability callbacks.</item>
</CHANGE_SUMMARY>
*/

/**
 * Minimal concurrency gate — permits N in-flight tasks at a time. FIFO.
 */

export type ConcurrencyGateOptions = {
  /** Observer: called when a task starts (inFlight count). */
  onAcquire?: (inFlight: number) => void;
  /** Observer: called when a task finishes (inFlight, queueDepth). */
  onRelease?: (inFlight: number, queueDepth: number) => void;
};

export class ConcurrencyGate {
  private readonly limit: number;
  private readonly opts?: ConcurrencyGateOptions;
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(limit: number, opts?: ConcurrencyGateOptions) {
    if (limit <= 0 || !Number.isFinite(limit)) {
      throw new Error("ConcurrencyGate: limit must be > 0");
    }
    this.limit = limit;
    this.opts = opts;
  }

  /** Currently in-flight. */
  inFlight(): number {
    return this.active;
  }

  /** Queue depth (waiters, not yet started). */
  queueDepth(): number {
    return this.queue.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
    this.active++;
    this.opts?.onAcquire?.(this.active);
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
      this.opts?.onRelease?.(this.active, this.queue.length);
    }
  }
}
