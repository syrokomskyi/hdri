/*
<MODULE_CONTRACT>
<purpose>Exports types and functions for handling signal ontology, including parsing and validation.</purpose>
<non-goals>
  <item>Does not implement the logic for creating or modifying signal data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial export setup for signal ontology management.</item>
</CHANGE_SUMMARY>
*/

export type {
  SignalDefinition,
  SignalMigration,
  SignalOntology,
  SignalStability,
} from "./types.js";
export { signalOntologySchema, type ParsedSignalOntology } from "./schema.js";
export { parseOntology, readOntologyFile } from "./loader.js";
export {
  isActiveSignal,
  isValidPathFormat,
  validateObservation,
  validateObservations,
  type ObservationCandidate,
  type ValidationIssue,
  type ValidationResult,
} from "./validate.js";
