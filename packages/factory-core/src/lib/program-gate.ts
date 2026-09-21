/*
<MODULE_CONTRACT>
<purpose>Fail-closed admission gate for HDRI forward-only reliability — blocks live collection and publication without verified typed evidence.</purpose>
<non-goals>
  <item>Does not read files or verify evidence — verification is done by verifyAdmissionInput in admission-input.ts.</item>
  <item>Does not implement CLI commands or pipeline orchestration.</item>
  <item>Does not duplicate admission verification logic — evaluateProgramGate consumes VerifiedAdmissionInput.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0099: initial fail-closed ProgramGate contract and decision function.</item>
  <item>RFC-0113: replace string-based ProgramGateInput with VerifiedAdmissionInput; update output to admission-report schema.</item>
  <item>Require instance-bound verified authority; spreading bootstrap fields cannot grant effects.</item>
</CHANGE_SUMMARY>
*/

import type { EvidenceRef, VerifiedAdmissionInput } from "./admission-input.js";
import { AdmissionParseError, isVerifiedAdmissionInput } from "./admission-input.js";

export const ProgramGateSchema = "hdri-admission-report@1" as const;

export type ProgramGateOperation = "preserve" | "collect" | "publish";

export type ProgramGateStatus = "allowed" | "blocked";

export type BlockerCode =
  | "MISSING_PRESERVATION_RECEIPT"
  | "MISSING_COLLECTION_READINESS"
  | "MISSING_PUBLICATION_READINESS"
  | "MISSING_PERIOD"
  | "STALE_EVIDENCE"
  | "SCOPE_MISMATCH"
  | "UNVERIFIED_SIGNATURE"
  | "FIXTURE_KEY_IN_PRODUCTION";

export interface ProgramGate {
  schema: typeof ProgramGateSchema;
  operation: ProgramGateOperation;
  period: string;
  status: ProgramGateStatus;
  inputFingerprint: string;
  evidenceRefs: EvidenceRef[];
  blockerCodes: BlockerCode[];
}

export const evaluateProgramGate = (verified: VerifiedAdmissionInput): ProgramGate => {
  if (!isVerifiedAdmissionInput(verified))
    throw new AdmissionParseError("UNVERIFIED_ADMISSION_INPUT");
  const { scope, preservation, qualification, publication, inputFingerprint } = verified;
  const operation = scope.operation;

  const blockers: BlockerCode[] = [];
  const evidenceRefs: EvidenceRef[] = [];

  for (const ref of [
    verified.preservation,
    verified.qualification,
    verified.predecessor,
    verified.capacity,
    verified.publication,
  ]) {
    if (ref !== null) {
      evidenceRefs.push(ref);
    }
  }

  if (operation === "preserve") {
    if (!preservation) {
      blockers.push("MISSING_PRESERVATION_RECEIPT");
    }
    return {
      schema: ProgramGateSchema,
      operation,
      period: scope.period,
      status: blockers.length > 0 ? "blocked" : "allowed",
      inputFingerprint,
      evidenceRefs,
      blockerCodes: blockers,
    };
  }

  if (operation === "collect") {
    if (!preservation) {
      blockers.push("MISSING_PRESERVATION_RECEIPT");
    }
    if (!qualification || !verified.predecessor || !verified.capacity) {
      blockers.push("MISSING_COLLECTION_READINESS");
    }
    return {
      schema: ProgramGateSchema,
      operation,
      period: scope.period,
      status: blockers.length > 0 ? "blocked" : "allowed",
      inputFingerprint,
      evidenceRefs,
      blockerCodes: blockers,
    };
  }

  // operation === "publish"
  if (!preservation) {
    blockers.push("MISSING_PRESERVATION_RECEIPT");
  }
  if (!qualification) {
    blockers.push("MISSING_COLLECTION_READINESS");
  }
  if (!publication) {
    blockers.push("MISSING_PUBLICATION_READINESS");
  }

  return {
    schema: ProgramGateSchema,
    operation,
    period: scope.period,
    status: blockers.length > 0 ? "blocked" : "allowed",
    inputFingerprint,
    evidenceRefs,
    blockerCodes: blockers,
  };
};
