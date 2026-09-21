/*
<MODULE_CONTRACT>
<purpose>Re-export shim — all durable execution authority has been merged into execution-store.ts (RFC-0114 B1).</purpose>
<non-goals>
  <item>This file exists only for backward compatibility with existing imports.</item>
  <item>Will be removed at cutover once all consumers import directly from execution-store.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0114: merge all exports into execution-store.ts; this file is now a re-export shim.</item>
</CHANGE_SUMMARY>
*/

export {
  type MeasurementEvidence,
  type OrderedExecutionEvent,
  type SignedJournalSegment,
  createExecutionDb,
  executionDbPath,
  openExecutionDb,
  appendOrderedEvent,
  readOrderedEvents,
  allocateLeaseEpoch,
  verifyLeaseEpoch,
  releaseLeaseEpoch,
  writeMeasurementEvidence,
  readMeasurementEvidence,
  compactJournalSegment,
  readJournalSegment,
  measurementEvidenceForWorkKey,
} from "./execution-store.js";
