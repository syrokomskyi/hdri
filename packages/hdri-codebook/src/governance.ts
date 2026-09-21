/*
<MODULE_CONTRACT>
<purpose>Validates codebook governance.signedBy entries against signatory rules for MAJOR releases.
Provides a testable interface usable from scripts and other packages.</purpose>
<non-goals>
  <item>Does not parse YAML or read files — the caller supplies a parsed Codebook.</item>
  <item>Does not enforce exit codes or console output — that is the CLI script's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract signatory validation from scripts/validate-signatories.ts into a testable package function.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { parseSemVer } from "./version.js";

// ---------------------------------------------------------------------------
// Governance schema (supplements the codebook schema in parse.ts)
// ---------------------------------------------------------------------------

const signatorySchema = z.object({
  name: z.string().min(1),
  role: z.enum(["academic", "legal", "kammer"]),
});

const governanceSchema = z.object({
  signedBy: z.array(signatorySchema).min(1),
});

export type Signatory = z.infer<typeof signatorySchema>;
export type Governance = z.infer<typeof governanceSchema>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const REQUIRED_ROLES = ["academic", "legal", "kammer"] as const;
type RequiredRole = (typeof REQUIRED_ROLES)[number];

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type SignatoryInput = {
  name: string;
  role: string;
};

/**
 * Validates that the signatory list contains at least one entry per required role
 * (academic, legal, kammer) and a minimum of 3 signatories total.
 * Duplicated roles produce warnings, not errors.
 */
export function validateSignatories(signedBy: SignatoryInput[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const presentRoles = new Set(signedBy.map((s) => s.role));
  const missingRoles: RequiredRole[] = REQUIRED_ROLES.filter((r) => !presentRoles.has(r));

  if (missingRoles.length > 0) {
    errors.push(
      `Missing required signatory roles: ${missingRoles.join(", ")}. ` +
        `Each of [${REQUIRED_ROLES.join(", ")}] must appear at least once.`,
    );
  }

  if (signedBy.length < 3) {
    errors.push(`Minimum 3 signatories required (one per role), found ${signedBy.length}.`);
  }

  const roleCounts = new Map<string, number>();
  for (const s of signedBy) {
    roleCounts.set(s.role, (roleCounts.get(s.role) ?? 0) + 1);
  }
  for (const [role, count] of roleCounts.entries()) {
    if (count > 1) {
      warnings.push(`Role "${role}" appears ${count} times — only 1 counts toward the minimum.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Determines whether the current version is a MAJOR bump relative to the previous version.
 * When `previousVersion` is supplied, compares major segments.
 * Otherwise, uses the heuristic: major >= 2 is a MAJOR release.
 */
export function isMajorBump(currentVersion: string, previousVersion: string | undefined): boolean {
  const currentMajor = parseSemVer(currentVersion).major;
  if (previousVersion !== undefined) {
    const prevMajor = parseSemVer(previousVersion).major;
    return currentMajor > prevMajor;
  }
  return currentMajor >= 2;
}

/**
 * Parses and validates the governance section from a raw YAML-parsed object.
 * Returns the validated governance data, or null if no governance section exists.
 * Throws if the governance section is present but structurally invalid.
 */
const governanceWrapperSchema = z.object({
  governance: governanceSchema.optional(),
});

export function parseGovernance(raw: unknown): Governance | null {
  const result = governanceWrapperSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid governance section:\n` +
        result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  }
  return result.data.governance ?? null;
}
