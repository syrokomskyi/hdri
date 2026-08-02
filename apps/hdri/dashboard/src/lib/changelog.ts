/*
<MODULE_CONTRACT>
<purpose>Counts changelog entries from multiple candidate file paths</purpose>
<non-goals>
  <item>Does not modify or create changelog files</item>
  <item>Does not validate the content of changelog entries</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation to count changelog entries</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// In the monorepo, build runs from the root (pnpm --dir ../../.. exec astro build
// --root apps/hdri/dashboard), so the changelog is at apps/hdri/CHANGELOG_PUBLIC.md.
// In the exported repo, the build script is rewritten to plain `astro build` which
// runs from apps/hdri/dashboard/, and CHANGELOG_PUBLIC.md is at the repo root
// (../../../CHANGELOG_PUBLIC.md). The technical CHANGELOG.md is not shown on the site.
const CANDIDATE_PATHS = [
  resolve(process.cwd(), "apps/hdri/CHANGELOG_PUBLIC.md"),
  resolve(process.cwd(), "CHANGELOG_PUBLIC.md"),
  resolve(process.cwd(), "../../../CHANGELOG_PUBLIC.md"),
];
const BULLET_REGEX = /^- /gm;

export function getChangelogEntryCount(): number {
  for (const p of CANDIDATE_PATHS) {
    try {
      const content = readFileSync(p, "utf-8");
      return content.match(BULLET_REGEX)?.length ?? 0;
    } catch {
      // try next candidate
    }
  }
  return 0;
}
