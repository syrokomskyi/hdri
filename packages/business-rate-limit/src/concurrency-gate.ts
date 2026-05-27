/**
 * Minimal concurrency gate — permits N in-flight tasks at a time. FIFO.
 */

export class ConcurrencyGate {
  private readonly limit: number;
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(limit: number) {
    if (limit <= 0 || !Number.isFinite(limit)) {
      throw new Error('ConcurrencyGate: limit must be > 0');
    }
    this.limit = limit;
  }

  /** Currently in-flight. */
  inFlight(): number { return this.active; }

  /** Queue depth (waiters, not yet started). */
  queueDepth(): number { return this.queue.length; }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => { this.queue.push(resolve); });
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
