/*
<MODULE_CONTRACT>
<purpose>Unit tests for brief parser pool config fields (RFC-0105 AC-4: pool config from brief).</purpose>
</MODULE_CONTRACT>
*/

import { describe, it, expect } from "vitest";
import { parseBriefMarkdown, type Brief } from "../brief.js";

const minimalFrontmatter = [
  "---",
  "sourceToken: 2026-q3-de",
  "capsuleId: 01923abc-def0-7890-abcd-ef0123456789",
  "registryDbPath: /tmp/registry.db",
  "livenessDbPath: /tmp/liveness.db",
  "---",
  "",
  "Body text.",
].join("\n");

describe("brief pool config (RFC-0105)", () => {
  it("provides default pool config when omitted", () => {
    const brief = parseBriefMarkdown(minimalFrontmatter);
    expect(brief.poolSize).toBe(4);
    expect(brief.recycleAfterTargets).toBe(20);
    expect(brief.deadlineMs).toBe(120_000);
    expect(brief.terminationGraceMs).toBe(5_000);
  });

  it("parses custom pool config from frontmatter", () => {
    const md = [
      "---",
      "sourceToken: 2026-q3-de",
      "capsuleId: 01923abc-def0-7890-abcd-ef0123456789",
      "registryDbPath: /tmp/registry.db",
      "livenessDbPath: /tmp/liveness.db",
      "poolSize: 8",
      "recycleAfterTargets: 10",
      "deadlineMs: 60000",
      "terminationGraceMs: 3000",
      "---",
      "",
      "Body text.",
    ].join("\n");
    const brief = parseBriefMarkdown(md);
    expect(brief.poolSize).toBe(8);
    expect(brief.recycleAfterTargets).toBe(10);
    expect(brief.deadlineMs).toBe(60_000);
    expect(brief.terminationGraceMs).toBe(3_000);
  });

  it("Brief type includes all pool config fields", () => {
    const brief: Brief = parseBriefMarkdown(minimalFrontmatter);
    expect(brief).toHaveProperty("poolSize");
    expect(brief).toHaveProperty("recycleAfterTargets");
    expect(brief).toHaveProperty("deadlineMs");
    expect(brief).toHaveProperty("terminationGraceMs");
  });
});
