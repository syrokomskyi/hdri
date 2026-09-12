/*
<MODULE_CONTRACT>
<purpose>Mock fault injection adapters for HDRI qualification contract tests (RFC-0111). Test-only module — production tool implements its own real fault injection.</purpose>
<non-goals>
  <item>Does not perform real process kills or real disk filling.</item>
  <item>Does not test real resume equivalence — only validates the hash comparison logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0111: Mock fault injection adapters for contract tests.</item>
</CHANGE_SUMMARY>
*/

/**
 * Fault points where interruption can occur in the HDRI production chain.
 */
export type FaultPoint =
  | "cas-write"
  | "event-transaction"
  | "final-publication"
  | "extraction-checkpoint"
  | "scientific-report"
  | "replica-copy"
  | "public-promotion";

/**
 * Fault injection strategies for contract tests.
 * All injections are mock — no real process kills or disk filling.
 */
export type FaultStrategy =
  | "sigkill-mock"
  | "corrupt-json"
  | "disk-full-mock"
  | "dns-transient"
  | "clock-rollback"
  | "stale-lease"
  | "duplicate-device"
  | "classification-missing"
  | "public-data-leak";

/**
 * Maps fault points to the strategies that apply at each point.
 */
export const FAULT_MATRIX: Record<FaultPoint, FaultStrategy[]> = {
  "cas-write": ["sigkill-mock", "corrupt-json"],
  "event-transaction": ["sigkill-mock", "stale-lease"],
  "final-publication": ["sigkill-mock", "disk-full-mock"],
  "extraction-checkpoint": ["sigkill-mock", "clock-rollback"],
  "scientific-report": ["sigkill-mock", "classification-missing"],
  "replica-copy": ["sigkill-mock", "dns-transient"],
  "public-promotion": ["sigkill-mock", "public-data-leak"],
};

/**
 * Mock fault injector for contract tests.
 * Records injected faults without performing real operations.
 */
export class MockFaultInjector {
  readonly injectedFaults: Array<{ point: FaultPoint; strategy: FaultStrategy }> = [];

  /**
   * Inject a mock fault at the given point with the given strategy.
   * Records the fault for later verification — does NOT perform real operations.
   */
  inject(point: FaultPoint, strategy: FaultStrategy): void {
    this.injectedFaults.push({ point, strategy });
  }

  /**
   * Inject all faults from the fault matrix for the given point.
   */
  injectAllAt(point: FaultPoint): void {
    for (const strategy of FAULT_MATRIX[point]) {
      this.inject(point, strategy);
    }
  }

  /**
   * Returns true if any fault was injected at the given point.
   */
  wasInjectedAt(point: FaultPoint): boolean {
    return this.injectedFaults.some((f) => f.point === point);
  }

  /**
   * Returns all fault points that were injected.
   */
  getInjectedPoints(): FaultPoint[] {
    return [...new Set(this.injectedFaults.map((f) => f.point))];
  }

  /**
   * Reset the injector for a new test.
   */
  reset(): void {
    this.injectedFaults.length = 0;
  }
}

/**
 * All declared fault points — used to iterate the full fault matrix.
 */
export const ALL_FAULT_POINTS: FaultPoint[] = [
  "cas-write",
  "event-transaction",
  "final-publication",
  "extraction-checkpoint",
  "scientific-report",
  "replica-copy",
  "public-promotion",
];
