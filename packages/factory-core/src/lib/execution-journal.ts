/*
<MODULE_CONTRACT>
<purpose>Provides deterministic terminal-result selection and stage completeness for resumable HDRI work.</purpose>
<non-goals><item>Does not schedule processes or write mutable database state.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0026 centralizes resume semantics.</item>
</CHANGE_SUMMARY>
*/

import type { WorkState } from "./quarter-contracts.js";

export type Attempt = Readonly<{ ordinal: number; state: WorkState; resultSha256?: string }>;
export type TerminalResult = Readonly<{
  state: "succeeded" | "observed-failure";
  ordinal: number;
}> | null;

export const selectTerminalResult = (attempts: readonly Attempt[]): TerminalResult => {
  const success = attempts
    .filter((attempt) => attempt.state === "succeeded" && attempt.resultSha256)
    .sort((a, b) => a.ordinal - b.ordinal)[0];
  if (success) return { state: "succeeded", ordinal: success.ordinal };
  const failure = attempts
    .filter((attempt) => attempt.state === "observed-failure")
    .sort((a, b) => b.ordinal - a.ordinal)[0];
  return failure ? { state: "observed-failure", ordinal: failure.ordinal } : null;
};

export const assertStageComplete = (
  input: Readonly<{
    targetCount: number;
    succeeded: number;
    observedFailures: number;
    approvedExclusions: number;
    quarantined: number;
  }>,
): void => {
  if (input.quarantined !== 0) throw new Error("Stage cannot seal while quarantined work remains");
  if (input.targetCount !== input.succeeded + input.observedFailures + input.approvedExclusions) {
    throw new Error("Stage target arithmetic is incomplete");
  }
};

// RFC-0114: Typed set reconciliation replacing sorted-ID comparison.
// Expected and terminal work-set digests use canonical key encoding.
// Rejects duplicates before hashing. Returns disjoint partition info.
export type ReconciledSet = Readonly<{
  expected: readonly string[];
  terminal: readonly string[];
  missing: readonly string[];
  extra: readonly string[];
  intersection: readonly string[];
  isDisjoint: boolean;
  isComplete: boolean;
}>;

export const reconcileTerminalSet = (
  expected: readonly string[],
  terminal: readonly string[],
): ReconciledSet => {
  const expectedSet = new Set(expected);
  const terminalSet = new Set(terminal);

  // Reject duplicates
  if (expectedSet.size !== expected.length) {
    throw new Error("Expected work set contains duplicates");
  }
  if (terminalSet.size !== terminal.length) {
    throw new Error("Terminal work set contains duplicates");
  }

  const sortedExpected = [...expectedSet].sort();
  const sortedTerminal = [...terminalSet].sort();

  const missing = sortedExpected.filter((id) => !terminalSet.has(id));
  const extra = sortedTerminal.filter((id) => !expectedSet.has(id));
  const intersection = sortedExpected.filter((id) => terminalSet.has(id));

  return {
    expected: sortedExpected,
    terminal: sortedTerminal,
    missing,
    extra,
    intersection,
    isDisjoint: intersection.length === 0,
    isComplete: missing.length === 0 && extra.length === 0,
  };
};
