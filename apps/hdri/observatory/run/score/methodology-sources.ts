/*
<MODULE_CONTRACT>
<purpose>Supplies the real signal-map and missingness-policy sources that
computeMethodologyFingerprint hashes (RFC-0107). The signal map lives in TypeScript exports,
so its canonical JSON — not raw source bytes — is the stable identity. The missingness policy
is a versioned YAML artifact under policies/, hashed as raw bytes like the snapshot producer's
componentDigest.</purpose>
<non-goals>
  <item>Does not decide comparability — that is methodology-comparison.ts.</item>
  <item>Does not parse or validate policy content — only loads the exact bytes in effect.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>C1: wire real signal-map/missingness sources into the run methodology fingerprint —
  previously ScoreHdriGogol passed null for both, leaving the RFC-0107 component identity
  incomplete.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { AXE_SIGNAL_MAP, EXT_SIGNAL_MAP } from "@syrokomskyi/observatory-core";
import { canonicalJson } from "./methodology-core";

/**
 * Canonical signal-map source text — the exact bytes the run fingerprint hashes.
 * The map lives in TS exports, so raw source bytes drift with formatting; the semantic
 * content is the exported mapping itself. Must stay identical to what
 * tools/scientific-reports/methodology-digests.ts digests via signalMapDigest().
 */
export const signalMapSource = (
  ext: ReadonlyArray<unknown> = EXT_SIGNAL_MAP,
  axe: ReadonlyArray<unknown> = AXE_SIGNAL_MAP,
): string => canonicalJson({ axe, ext });

const POLICY_FILE = /^missingness-policy-v(\d+)\.yaml$/;

/**
 * Loads the raw bytes of the latest policies/missingness-policy-vN.yaml — the same bytes the
 * scientific snapshot's componentDigest hashes. Returns null when no policy file exists
 * (honest absence — the fingerprint records null rather than a fabricated digest).
 */
export const loadMissingnessPolicySource = async (
  policiesDir = path.resolve(process.cwd(), "policies"),
): Promise<string | null> => {
  let entries: string[];
  try {
    entries = await fs.readdir(policiesDir);
  } catch {
    return null;
  }
  const versions = entries
    .map((name) => {
      const match = POLICY_FILE.exec(name);
      return match ? { name, version: Number(match[1]) } : null;
    })
    .filter((e): e is { name: string; version: number } => e !== null)
    .sort((a, b) => b.version - a.version);
  const latest = versions[0];
  if (!latest) return null;
  return fs.readFile(path.join(policiesDir, latest.name), "utf-8");
};
