/*
<MODULE_CONTRACT>
<purpose>Typed, scope-bound verified evidence contract for HDRI admission — replaces string-based ProgramGateInput with verified EvidenceRef objects.</purpose>
<non-goals>
  <item>Does not implement CLI commands or pipeline orchestration.</item>
  <item>Does not duplicate ProgramGate domain logic — verifyAdmissionInput produces VerifiedAdmissionInput, evaluateProgramGate consumes it.</item>
  <item>Does not read files or verify signatures directly — I/O is injected via AdmissionVerificationDeps.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0113: initial AdmissionInput, EvidenceRef, EvidenceScope types and verification function.</item>
  <item>Reject copied authority, cross-scope signed evidence and mutation after verification.</item>
</CHANGE_SUMMARY>
*/

export const AdmissionInputSchema = "hdri-admission-input@1" as const;

const PERIOD_RE = /^\d{4}-q[1-4]$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export interface EvidenceRef {
  schema: string;
  uri: string;
  bytes: number;
  sha256: string;
}

export interface EvidenceScope {
  period: string;
  capsuleId: string;
  operation: "preserve" | "collect" | "publish";
  implementationFingerprint: string;
  policySha256: string;
  evidenceClass: "fixture" | "operational";
}

export interface AdmissionInput {
  schema: typeof AdmissionInputSchema;
  scope: EvidenceScope;
  preservation: EvidenceRef | null;
  qualification: EvidenceRef | null;
  predecessor: EvidenceRef | null;
  capacity: EvidenceRef | null;
  publication: EvidenceRef | null;
}

const VERIFIED = Symbol("RFC-0113 verified admission input");
const verifiedInstances = new WeakSet<object>();

/** Authority is instance-bound; copying an object's symbols does not copy verification. */
export function isVerifiedAdmissionInput(value: unknown): value is VerifiedAdmissionInput {
  return typeof value === "object" && value !== null && verifiedInstances.has(value);
}

function freezeAdmission<T extends AdmissionInput | VerifiedAdmissionInput>(input: T): T {
  Object.freeze(input.scope);
  for (const ref of [
    input.preservation,
    input.qualification,
    input.predecessor,
    input.capacity,
    input.publication,
  ]) {
    if (ref) Object.freeze(ref);
  }
  return Object.freeze(input);
}

export interface VerifiedAdmissionInput {
  readonly [VERIFIED]: true;
  readonly schema: typeof AdmissionInputSchema;
  readonly scope: EvidenceScope;
  readonly preservation: EvidenceRef | null;
  readonly qualification: EvidenceRef | null;
  readonly predecessor: EvidenceRef | null;
  readonly capacity: EvidenceRef | null;
  readonly publication: EvidenceRef | null;
  readonly inputFingerprint: string;
}

export interface EvidenceVerificationResult {
  valid: boolean;
  keyClass: "operational" | "fixture" | null;
  /** Scope decoded from authenticated evidence, never copied from the untrusted request. */
  scope?: EvidenceScope | null;
}

export interface AdmissionVerificationDeps {
  verifyEvidenceRef: (
    ref: EvidenceRef,
    expected: Readonly<{ role: string; scope: EvidenceScope }>,
  ) => Promise<EvidenceVerificationResult>;
  sha256: (data: string) => string;
}

export class AdmissionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdmissionParseError";
  }
}

function validateEvidenceRef(ref: unknown, field: string): EvidenceRef | null {
  if (ref === null) return null;
  if (typeof ref !== "object" || ref === null || Array.isArray(ref)) {
    throw new AdmissionParseError(`AdmissionInput: ${field} must be an object or null`);
  }
  const r = ref as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (!["schema", "uri", "bytes", "sha256"].includes(key))
      throw new AdmissionParseError(`AdmissionInput: unknown field ${field}.${key}`);
  }
  if (typeof r.schema !== "string" || r.schema.length === 0) {
    throw new AdmissionParseError(`AdmissionInput: ${field}.schema must be a non-empty string`);
  }
  if (
    typeof r.uri !== "string" ||
    r.uri.includes(":") ||
    r.uri.includes("\\") ||
    r.uri.includes("\0") ||
    r.uri.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new AdmissionParseError(`AdmissionInput: ${field}.uri must be a contained relative path`);
  }
  if (typeof r.bytes !== "number" || r.bytes < 0 || !Number.isSafeInteger(r.bytes)) {
    throw new AdmissionParseError(
      `AdmissionInput: ${field}.bytes must be a non-negative finite number`,
    );
  }
  if (typeof r.sha256 !== "string" || !SHA256_RE.test(r.sha256)) {
    throw new AdmissionParseError(
      `AdmissionInput: ${field}.sha256 must be a lowercase 64-char hex string`,
    );
  }
  return {
    schema: r.schema,
    uri: r.uri,
    bytes: r.bytes,
    sha256: r.sha256,
  };
}

export function parseAdmissionInput(raw: unknown): AdmissionInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AdmissionParseError("AdmissionInput: expected an object");
  }
  const obj = raw as Record<string, unknown>;

  if (obj.schema !== AdmissionInputSchema) {
    throw new AdmissionParseError(
      `AdmissionInput: unsupported schema "${obj.schema}", expected "${AdmissionInputSchema}"`,
    );
  }

  const scopeRaw = obj.scope;
  if (typeof scopeRaw !== "object" || scopeRaw === null || Array.isArray(scopeRaw)) {
    throw new AdmissionParseError("AdmissionInput: scope must be an object");
  }
  const s = scopeRaw as Record<string, unknown>;
  for (const key of Object.keys(s)) {
    if (
      ![
        "period",
        "capsuleId",
        "operation",
        "implementationFingerprint",
        "policySha256",
        "evidenceClass",
      ].includes(key)
    ) {
      throw new AdmissionParseError(`AdmissionInput: unknown field scope.${key}`);
    }
  }

  if (typeof s.period !== "string" || !PERIOD_RE.test(s.period)) {
    throw new AdmissionParseError(
      `AdmissionInput: scope.period must match YYYY-qN format, got "${s.period}"`,
    );
  }
  if (typeof s.capsuleId !== "string" || s.capsuleId.length === 0) {
    throw new AdmissionParseError("AdmissionInput: scope.capsuleId must be a non-empty string");
  }
  if (
    typeof s.operation !== "string" ||
    !["preserve", "collect", "publish"].includes(s.operation)
  ) {
    throw new AdmissionParseError(
      `AdmissionInput: scope.operation must be "preserve" | "collect" | "publish", got "${s.operation}"`,
    );
  }
  if (typeof s.implementationFingerprint !== "string" || s.implementationFingerprint.length === 0) {
    throw new AdmissionParseError(
      "AdmissionInput: scope.implementationFingerprint must be a non-empty string",
    );
  }
  if (typeof s.policySha256 !== "string" || !SHA256_RE.test(s.policySha256)) {
    throw new AdmissionParseError(
      "AdmissionInput: scope.policySha256 must be a lowercase 64-char hex string",
    );
  }
  if (
    typeof s.evidenceClass !== "string" ||
    !["fixture", "operational"].includes(s.evidenceClass)
  ) {
    throw new AdmissionParseError(
      `AdmissionInput: scope.evidenceClass must be "fixture" | "operational", got "${s.evidenceClass}"`,
    );
  }

  const scope: EvidenceScope = {
    period: s.period,
    capsuleId: s.capsuleId,
    operation: s.operation as EvidenceScope["operation"],
    implementationFingerprint: s.implementationFingerprint,
    policySha256: s.policySha256,
    evidenceClass: s.evidenceClass as EvidenceScope["evidenceClass"],
  };

  const knownKeys = new Set([
    "schema",
    "scope",
    "preservation",
    "qualification",
    "predecessor",
    "capacity",
    "publication",
  ]);
  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      throw new AdmissionParseError(`AdmissionInput: unknown field "${key}"`);
    }
  }

  return {
    schema: AdmissionInputSchema,
    scope,
    preservation: validateEvidenceRef(obj.preservation, "preservation"),
    qualification: validateEvidenceRef(obj.qualification, "qualification"),
    predecessor: validateEvidenceRef(obj.predecessor, "predecessor"),
    capacity: validateEvidenceRef(obj.capacity, "capacity"),
    publication: validateEvidenceRef(obj.publication, "publication"),
  };
}

export async function verifyAdmissionInput(
  input: AdmissionInput,
  deps: AdmissionVerificationDeps,
): Promise<VerifiedAdmissionInput> {
  // Parse a detached copy before yielding; callers cannot change what will be authorized.
  input = freezeAdmission(parseAdmissionInput(input));
  const refs: Array<[string, EvidenceRef | null]> = [
    ["preservation", input.preservation],
    ["qualification", input.qualification],
    ["predecessor", input.predecessor],
    ["capacity", input.capacity],
    ["publication", input.publication],
  ];

  for (const [name, ref] of refs) {
    if (ref === null) continue;
    const result = await deps.verifyEvidenceRef(
      ref,
      Object.freeze({ role: name, scope: input.scope }),
    );
    if (!result.valid) {
      throw new AdmissionParseError(`AdmissionInput: evidence ref "${name}" failed verification`);
    }
    if (result.keyClass !== input.scope.evidenceClass) {
      throw new AdmissionParseError(
        `AdmissionInput: evidence ref "${name}" signed by ${result.keyClass} key but scope.evidenceClass is "${input.scope.evidenceClass}" — trust root mismatch`,
      );
    }
    if (
      !result.scope ||
      Object.entries(input.scope).some(
        ([field, value]) => result.scope![field as keyof EvidenceScope] !== value,
      )
    ) {
      throw new AdmissionParseError(
        `AdmissionInput: evidence ref "${name}" authenticated scope mismatch`,
      );
    }
  }

  const fingerprint = deps.sha256(JSON.stringify(input));
  if (!SHA256_RE.test(fingerprint))
    throw new AdmissionParseError("AdmissionInput: invalid computed fingerprint");

  const verified: VerifiedAdmissionInput = freezeAdmission({
    [VERIFIED]: true as const,
    schema: input.schema,
    scope: input.scope,
    preservation: input.preservation,
    qualification: input.qualification,
    predecessor: input.predecessor,
    capacity: input.capacity,
    publication: input.publication,
    inputFingerprint: fingerprint,
  });
  verifiedInstances.add(verified);
  return verified;
}

export function createBootstrapAdmission(params: {
  period: string;
  capsuleId: string;
  operation: "preserve" | "collect" | "publish";
}): VerifiedAdmissionInput {
  const scope: EvidenceScope = {
    period: params.period,
    capsuleId: params.capsuleId,
    operation: params.operation,
    implementationFingerprint: "bootstrap",
    policySha256: "0".repeat(64),
    evidenceClass: "fixture",
  };
  const verified: VerifiedAdmissionInput = freezeAdmission({
    [VERIFIED]: true as const,
    schema: AdmissionInputSchema,
    scope,
    preservation: null,
    qualification: null,
    predecessor: null,
    capacity: null,
    publication: null,
    inputFingerprint: `bootstrap:${JSON.stringify(scope)}`,
  });
  verifiedInstances.add(verified);
  return verified;
}

export function toAdmissionInput(verified: VerifiedAdmissionInput): AdmissionInput {
  return {
    schema: verified.schema,
    scope: verified.scope,
    preservation: verified.preservation,
    qualification: verified.qualification,
    predecessor: verified.predecessor,
    capacity: verified.capacity,
    publication: verified.publication,
  };
}
