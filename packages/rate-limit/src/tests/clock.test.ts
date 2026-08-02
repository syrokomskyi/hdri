import { describe, it, expect } from "vitest";
import { defaultClock, sleepFromClock } from "../clock.js";
import { TestClock } from "./test-clock.js";

describe("defaultClock", () => {
  it("now() returns a number that increases over time", () => {
    const t0 = defaultClock.now();
    const t1 = defaultClock.now();
    expect(t1).toBeGreaterThanOrEqual(t0);
  });

  it("random() returns a value in [0, 1)", () => {
    for (let i = 0; i < 100; i++) {
      const r = defaultClock.random();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it("setTimeout returns an object with unref", () => {
    const result = defaultClock.setTimeout(() => {}, 1000);
    expect(typeof result.unref).toBe("function");
    result.unref?.();
  });
});

describe("sleepFromClock", () => {
  it("resolves after the specified delay on TestClock", async () => {
    const clock = new TestClock();
    const sleep = sleepFromClock(clock);
    let resolved = false;
    const p = sleep(500).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    clock.advance(500);
    await p;
    expect(resolved).toBe(true);
  });

  it("does not resolve before the delay elapses", async () => {
    const clock = new TestClock();
    const sleep = sleepFromClock(clock);
    let resolved = false;
    const p = sleep(1000).then(() => {
      resolved = true;
    });
    clock.advance(500);
    await Promise.resolve();
    expect(resolved).toBe(false);
    clock.advance(500);
    await p;
    expect(resolved).toBe(true);
  });
});

describe("TestClock", () => {
  it("starts at the given time", () => {
    const clock = new TestClock(5000);
    expect(clock.now()).toBe(5000);
  });

  it("advance() moves time forward", () => {
    const clock = new TestClock(0);
    clock.advance(100);
    expect(clock.now()).toBe(100);
    clock.advance(200);
    expect(clock.now()).toBe(300);
  });

  it("fires timers in order", () => {
    const clock = new TestClock(0);
    const order: number[] = [];
    clock.setTimeout(() => order.push(2), 200);
    clock.setTimeout(() => order.push(1), 100);
    clock.setTimeout(() => order.push(3), 300);
    clock.advance(300);
    expect(order).toEqual([1, 2, 3]);
  });

  it("setNow sets absolute time without firing timers", () => {
    const clock = new TestClock(0);
    let fired = false;
    clock.setTimeout(() => {
      fired = true;
    }, 1000);
    clock.setNow(500);
    expect(clock.now()).toBe(500);
    expect(fired).toBe(false);
  });

  it("random() uses provided function", () => {
    const clock = new TestClock(0, () => 0.5);
    expect(clock.random()).toBe(0.5);
  });

  it("pending returns number of scheduled timers", () => {
    const clock = new TestClock(0);
    clock.setTimeout(() => {}, 100);
    clock.setTimeout(() => {}, 200);
    expect(clock.pending).toBe(2);
    clock.advance(150);
    expect(clock.pending).toBe(1);
  });
});
