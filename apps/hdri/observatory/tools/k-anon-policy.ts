/*
<MODULE_CONTRACT>
<purpose>Loads and parses the k-anonymity policy YAML file, resolving the effective k minimum with hard-floor enforcement.</purpose>
<non-goals>
  <item>Does not perform k-anonymity filtering — callers use the resolved value.</item>
  <item>Does not cache policy across processes; each invocation reads from disk.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: replace hardcoded K_ANONYMITY_MIN=5 across all export tools with policy-driven value.</item>
</CHANGE_SUMMARY>
// @ai-invariant: effective_k_min must never fall below hard_floor unless high_risk_release is explicitly true in the policy file
*/

import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export type KAnonPolicy = {
  default_k: number;
  hard_floor: number;
  high_risk_release: boolean;
  /** Resolved effective k: default_k clamped to hard_floor unless high_risk_release is true. */
  effective_k_min: number;
  /** Path to the policy file that was loaded. */
  policyPath: string;
  /** Version number extracted from the filename (e.g. 1 for k-anon-policy-v1.yaml). */
  version: number;
};

const POLICIES_DIR = path.resolve(process.cwd(), "policies");

/**
 * Finds the latest k-anon policy file by version number.
 * Files must be named `k-anon-policy-v{N}.yaml` where {N} is a positive integer.
 */
async function findLatestPolicyFile(): Promise<{ filePath: string; version: number } | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(POLICIES_DIR);
  } catch {
    return null;
  }

  const policyFiles = entries
    .map((name) => {
      const match = /^k-anon-policy-v(\d+)\.ya?ml$/i.exec(name);
      return match ? { filePath: path.join(POLICIES_DIR, name), version: Number(match[1]) } : null;
    })
    .filter((entry): entry is { filePath: string; version: number } => entry !== null)
    .sort((a, b) => b.version - a.version);

  return policyFiles[0] ?? null;
}

/**
 * Loads the latest k-anon policy file and resolves the effective k minimum.
 *
 * Resolution rules:
 * - If default_k >= hard_floor → effective_k_min = default_k
 * - If default_k < hard_floor AND high_risk_release is true → effective_k_min = default_k
 * - If default_k < hard_floor AND high_risk_release is false → effective_k_min = hard_floor
 *
 * Throws if no policy file is found or if the file is malformed.
 */
export async function loadKAnonPolicy(): Promise<KAnonPolicy> {
  const latest = await findLatestPolicyFile();
  if (!latest) {
    throw new Error(
      `No k-anon policy file found in ${POLICIES_DIR}. Expected k-anon-policy-v{N}.yaml.`,
    );
  }

  const content = await fs.readFile(latest.filePath, "utf-8");
  const parsed = parse(content) as {
    default_k?: number;
    hard_floor?: number;
    high_risk_release?: boolean;
  };

  if (typeof parsed.default_k !== "number" || parsed.default_k < 1) {
    throw new Error(
      `Invalid k-anon policy: default_k must be a positive number (got ${parsed.default_k})`,
    );
  }
  if (typeof parsed.hard_floor !== "number" || parsed.hard_floor < 1) {
    throw new Error(
      `Invalid k-anon policy: hard_floor must be a positive number (got ${parsed.hard_floor})`,
    );
  }
  if (typeof parsed.high_risk_release !== "boolean") {
    parsed.high_risk_release = false;
  }

  const effective_k_min =
    parsed.default_k < parsed.hard_floor && !parsed.high_risk_release
      ? parsed.hard_floor
      : parsed.default_k;

  return {
    default_k: parsed.default_k,
    hard_floor: parsed.hard_floor,
    high_risk_release: parsed.high_risk_release,
    effective_k_min,
    policyPath: path.relative(process.cwd(), latest.filePath).replaceAll("\\", "/"),
    version: latest.version,
  };
}
