import { expect, test } from "vitest";
import { bundleDependencyState } from "../../tools/availability-after-bundle";

const invocation = "a".repeat(32);
const snapshot = (changes: Record<string, string> = {}) =>
  Object.entries({
    LoadState: "loaded",
    InvocationID: invocation,
    ActiveState: "inactive",
    Result: "success",
    ExecMainCode: "1",
    ExecMainStatus: "0",
    ExecMainExitTimestampMonotonic: "123456",
    ...changes,
  })
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
test("preparation follows only a proven successful exit", () => {
  expect(bundleDependencyState(snapshot(), invocation)).toBe("complete");
  expect(bundleDependencyState(snapshot({ ActiveState: "active" }), invocation)).toBe("wait");
});
const invalidSnapshots: Record<string, string>[] = [
  { LoadState: "not-found" },
  { InvocationID: "b".repeat(32) },
  { Result: "exit-code" },
  { ExecMainCode: "2" },
  { ExecMainStatus: "1" },
  { ExecMainExitTimestampMonotonic: "0" },
  { ActiveState: "unknown" },
];
test.each(invalidSnapshots)("unproven or failed bundle cannot unlock preparation: %o", (changes) => {
  expect(() => bundleDependencyState(snapshot(changes), invocation)).toThrow();
});
