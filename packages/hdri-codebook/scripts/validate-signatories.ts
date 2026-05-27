#!/usr/bin/env tsx
/**
 * validate-signatories — checks that a codebook YAML contains valid
 * governance.signedBy entries before a MAJOR release.
 *
 * Usage:
 *   tsx scripts/validate-signatories.ts <codebook.yaml> [options]
 *
 * Options:
 *   --enforce              Exit 1 when the codebook is a MAJOR version (major ≥ 2)
 *                          and the signatory rules are not satisfied.
 *                          Without this flag, failures are printed as warnings only.
 *   --previous-version <v> Semver of the previously released codebook.
 *                          When supplied, "MAJOR bump" is detected by comparing
 *                          the major segment to this value instead of using
 *                          the absolute major ≥ 2 heuristic.
 *
 * Rules (Governance §3):
 *   governance.signedBy must contain at least one entry for each required role:
 *     • academic  — independent researcher / university / institute
 *     • legal     — lawyer / DSGVO expert
 *     • kammer    — Handwerkskammer / trade body representative
 *   Minimum total signatories: 3 (one per role, no double-counting).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const signatorySchema = z.object({
  name: z.string().min(1),
  role: z.enum(['academic', 'legal', 'kammer']),
});

const governanceSchema = z.object({
  signedBy: z.array(signatorySchema).min(1),
});

const codebookMetaSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be MAJOR.MINOR.PATCH'),
  governance: governanceSchema.optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQUIRED_ROLES = ['academic', 'legal', 'kammer'] as const;
type RequiredRole = (typeof REQUIRED_ROLES)[number];

function parseMajor(semver: string): number {
  const major = parseInt(semver.split('.')[0]!, 10);
  if (isNaN(major)) throw new Error(`Cannot parse major from version: ${semver}`);
  return major;
}

function isMajorBump(currentVersion: string, previousVersion: string | undefined): boolean {
  const currentMajor = parseMajor(currentVersion);
  if (previousVersion !== undefined) {
    const prevMajor = parseMajor(previousVersion);
    return currentMajor > prevMajor;
  }
  // Heuristic: treat major ≥ 2 as a MAJOR release that needs sign-off.
  return currentMajor >= 2;
}

interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function validateSignatories(
  signedBy: Array<{ name: string; role: string }>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const presentRoles = new Set(signedBy.map((s) => s.role));
  const missingRoles: RequiredRole[] = REQUIRED_ROLES.filter((r) => !presentRoles.has(r));

  if (missingRoles.length > 0) {
    errors.push(
      `Missing required signatory roles: ${missingRoles.join(', ')}. ` +
        `Each of [${REQUIRED_ROLES.join(', ')}] must appear at least once.`,
    );
  }

  if (signedBy.length < 3) {
    errors.push(
      `Minimum 3 signatories required (one per role), found ${signedBy.length}.`,
    );
  }

  // Duplicated roles are warnings, not errors.
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

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  codebookPath: string;
  enforce: boolean;
  previousVersion: string | undefined;
} {
  const args = argv.slice(2); // strip node + script
  const codebookPath = args.find((a) => !a.startsWith('--'));
  if (!codebookPath) {
    console.error('Usage: validate-signatories <codebook.yaml> [--enforce] [--previous-version <v>]');
    process.exit(1);
  }

  const enforce = args.includes('--enforce');
  const pvIdx = args.indexOf('--previous-version');
  const previousVersion = pvIdx !== -1 ? args[pvIdx + 1] : undefined;

  return { codebookPath: resolve(codebookPath), enforce, previousVersion };
}

function main(): void {
  const { codebookPath, enforce, previousVersion } = parseArgs(process.argv);

  // --- Read & parse YAML ---
  let source: string;
  try {
    source = readFileSync(codebookPath, 'utf-8');
  } catch {
    console.error(`validate-signatories: cannot read file: ${codebookPath}`);
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (e) {
    console.error(`validate-signatories: YAML parse error in ${codebookPath}: ${e}`);
    process.exit(1);
  }

  const meta = codebookMetaSchema.safeParse(raw);
  if (!meta.success) {
    console.error(
      `validate-signatories: schema error in ${codebookPath}:\n` +
        meta.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
    process.exit(1);
  }

  const { id, version, governance } = meta.data;
  const label = `${id}@${version}`;
  const majorBump = isMajorBump(version, previousVersion);

  console.log(`validate-signatories: checking ${label}`);
  if (previousVersion) {
    console.log(
      `  previous version: ${previousVersion} → ` +
        `major bump: ${majorBump ? 'YES' : 'no'}`,
    );
  } else {
    console.log(
      `  major heuristic (major ≥ 2): ` +
        `${majorBump ? 'YES (enforce applies)' : 'no (enforce not triggered)'}`,
    );
  }

  // --- Missing governance block ---
  if (!governance) {
    const msg = `Codebook ${label} has no "governance.signedBy" section.`;
    if (enforce && majorBump) {
      console.error(`\nERROR: ${msg}`);
      console.error(
        'Add a governance block with at least one entry per required role ' +
          `(${REQUIRED_ROLES.join(', ')}).`,
      );
      process.exit(1);
    } else {
      console.warn(`\nWARNING: ${msg}`);
      console.warn('This will be required for MAJOR releases. Add governance.signedBy to the codebook.');
      process.exit(0);
    }
  }

  // --- Validate signatories ---
  const { ok, errors, warnings } = validateSignatories(governance.signedBy);

  for (const w of warnings) {
    console.warn(`  ⚠  ${w}`);
  }

  if (!ok) {
    for (const e of errors) {
      const prefix = enforce && majorBump ? 'ERROR' : 'WARNING';
      const fn = enforce && majorBump ? console.error : console.warn;
      fn(`  ${prefix === 'ERROR' ? '✗' : '⚠'}  ${e}`);
    }

    if (enforce && majorBump) {
      console.error(
        `\nvalidate-signatories: FAILED — ${label} requires valid signatory coverage for a MAJOR release.`,
      );
      process.exit(1);
    } else {
      console.warn(
        `\nvalidate-signatories: WARNING — signatory issues found in ${label} (not enforced at this version).`,
      );
      process.exit(0);
    }
  }

  const roleList = governance.signedBy.map((s) => `${s.name} (${s.role})`).join(', ');
  console.log(`  ✓  ${governance.signedBy.length} signatories: ${roleList}`);
  console.log(`validate-signatories: OK — ${label} governance check passed.`);
}

main();
