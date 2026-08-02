#!/usr/bin/env tsx
/*
<MODULE_CONTRACT>
<purpose>CLI wrapper for signatory validation — delegates all logic to @syrokomskyi/hdri-codebook governance module.</purpose>
<non-goals>
  <item>Does not implement validation logic — that lives in src/governance.ts.</item>
  <item>Does not modify or update the codebook YAML file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of signatory validation for codebook YAML files.</item>
  <item>Delegate to package-level validateSignatories/isMajorBump/parseGovernance — remove duplicated schema and logic.</item>
  <item>Move shebang to line 1 so tsx/esbuild can parse the file.</item>
</CHANGE_SUMMARY>
*/

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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  validateSignatories,
  isMajorBump,
  parseGovernance,
  REQUIRED_ROLES,
} from "../src/governance.js";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  codebookPath: string;
  enforce: boolean;
  previousVersion: string | undefined;
} {
  const args = argv.slice(2);
  const codebookPath = args.find((a) => !a.startsWith("--"));
  if (!codebookPath) {
    console.error(
      "Usage: validate-signatories <codebook.yaml> [--enforce] [--previous-version <v>]",
    );
    process.exit(1);
  }

  const enforce = args.includes("--enforce");
  const pvIdx = args.indexOf("--previous-version");
  const previousVersion = pvIdx !== -1 ? args[pvIdx + 1] : undefined;

  return { codebookPath: resolve(codebookPath), enforce, previousVersion };
}

// Minimal schema to extract id + version for logging (governance is parsed separately)
const metaSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be MAJOR.MINOR.PATCH"),
});

function main(): void {
  const { codebookPath, enforce, previousVersion } = parseArgs(process.argv);

  let source: string;
  try {
    source = readFileSync(codebookPath, "utf-8");
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

  const meta = metaSchema.safeParse(raw);
  if (!meta.success) {
    console.error(
      `validate-signatories: schema error in ${codebookPath}:\n` +
        meta.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"),
    );
    process.exit(1);
  }

  const { id, version } = meta.data;
  const label = `${id}@${version}`;
  const majorBump = isMajorBump(version, previousVersion);

  console.log(`validate-signatories: checking ${label}`);
  if (previousVersion) {
    console.log(
      `  previous version: ${previousVersion} → ` + `major bump: ${majorBump ? "YES" : "no"}`,
    );
  } else {
    console.log(
      `  major heuristic (major ≥ 2): ` +
        `${majorBump ? "YES (enforce applies)" : "no (enforce not triggered)"}`,
    );
  }

  let governance;
  try {
    governance = parseGovernance(raw);
  } catch (e) {
    console.error(
      `validate-signatories: governance schema error in ${codebookPath}:\n${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  }

  if (!governance) {
    const msg = `Codebook ${label} has no "governance.signedBy" section.`;
    if (enforce && majorBump) {
      console.error(`\nERROR: ${msg}`);
      console.error(
        "Add a governance block with at least one entry per required role " +
          `(${REQUIRED_ROLES.join(", ")}).`,
      );
      process.exit(1);
    } else {
      console.warn(`\nWARNING: ${msg}`);
      console.warn(
        "This will be required for MAJOR releases. Add governance.signedBy to the codebook.",
      );
      process.exit(0);
    }
  }

  const { ok, errors, warnings } = validateSignatories(governance.signedBy);

  for (const w of warnings) {
    console.warn(`  ⚠  ${w}`);
  }

  if (!ok) {
    for (const e of errors) {
      const prefix = enforce && majorBump ? "ERROR" : "WARNING";
      const fn = enforce && majorBump ? console.error : console.warn;
      fn(`  ${prefix === "ERROR" ? "✗" : "⚠"}  ${e}`);
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

  const roleList = governance.signedBy.map((s) => `${s.name} (${s.role})`).join(", ");
  console.log(`  ✓  ${governance.signedBy.length} signatories: ${roleList}`);
  console.log(`validate-signatories: OK — ${label} governance check passed.`);
}

main();
