/*
<MODULE_CONTRACT>
<purpose>Bootstraps a structured brief and loads the ontology for the contract-ontology pipeline.</purpose>
<non-goals>
  <item>Do not handle pipeline orchestration beyond input validation.</item>
  <item>Do not manage factory output discovery — that is done by DiscoverSourcesGogol.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
  <item>Fix brief template to use canonical lowercase period format (2026-q2).</item>
  <item>Remove spurious parseBriefMarkdown call on root brief — root brief has no period and is not a full Brief.</item>
  <item>Fix ontology fallback path: add missing apps/ segment so it correctly resolves to apps/hdri/observatory/.input/ontology.yaml.</item>
  <item>Use a minimal period, capsule UUID and ontology brief; upstream databases are discovered.</item>
  <item>Update path references to reflect the move of HDRI apps into apps/hdri/.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import matter from "gray-matter";
import { PipelinePauseError } from "@syrokomskyi/pipeline-core";
import { readOntologyFile, withAvailabilityOntologyV2, type SignalOntology } from "@syrokomskyi/observatory-core";
import { fileExists, readTextFile } from "@syrokomskyi/pipeline-node/context";
import { mergeBriefFrontmatter } from "@syrokomskyi/pipeline-node/frontmatter";
import type { Brief } from "../../brief.js";
import { parseBriefMarkdown } from "../../brief.js";
import { inputDir, briefInputDir } from "../../config.js";

export type BootstrappedBrief = {
  brief: Brief;
  briefMd: string;
  ontology: SignalOntology;
};

const briefTemplate = `---
period: "2026-q3"
ontologyVersion: "2.0.0"
capsuleId: "0198f000-0000-7000-8000-000000000000"

skipGogols: []
---
`;

export const bootstrapBrief = async (): Promise<BootstrappedBrief> => {
  // 1. Read root (factory-level) brief if it exists
  const rootBriefPath = path.join(inputDir, "brief.md");
  let rootData: Record<string, unknown> = {};
  const rootBriefExists = await fileExists(rootBriefPath);
  if (rootBriefExists) {
    const rootBriefMd = await readTextFile(rootBriefPath);
    if (rootBriefMd.trim().length > 0) {
      const parsed = matter(rootBriefMd);
      rootData = parsed.data as Record<string, unknown>;
    }
  }

  // 2. Read app-local brief (required)
  const localBriefPath = path.join(briefInputDir, "brief.md");
  const localBriefExists = await fileExists(localBriefPath);

  if (!localBriefExists) {
    throw new PipelinePauseError(
      [
        "Pipeline paused.",
        "Missing required input file: brief.md",
        `Create ${path.relative(process.cwd(), localBriefPath)} and rerun.`,
        "",
        "Template:",
        briefTemplate,
      ].join("\n"),
    );
  }

  const localBriefMd = await readTextFile(localBriefPath);
  if (localBriefMd.trim().length === 0) {
    throw new PipelinePauseError(
      [
        "Pipeline paused.",
        `Input file ${path.relative(process.cwd(), localBriefPath)} exists but is empty.`,
        "Fill it and rerun.",
        "",
        "Template:",
        briefTemplate,
      ].join("\n"),
    );
  }

  const localParsed = matter(localBriefMd);
  const localData = localParsed.data as Record<string, unknown>;

  // 3. Merge: app-local overrides root
  const mergedData = mergeBriefFrontmatter(rootData, localData);
  const mergedBriefMd = matter.stringify("", mergedData);

  let brief: Brief;
  try {
    brief = parseBriefMarkdown(mergedBriefMd);
  } catch (error) {
    throw new PipelinePauseError(
      [
        "Pipeline paused.",
        "Merged brief.md is invalid:",
        error instanceof Error ? error.message : String(error),
        "",
        "Root brief:",
        JSON.stringify(rootData, null, 2),
        "",
        "Local brief:",
        JSON.stringify(localData, null, 2),
      ].join("\n"),
    );
  }

  // 4. Load ontology
  const ontology = await loadOntology(brief.ontologyVersion);
  console.log(
    `[bootstrap] Loaded ontology v${ontology.version} (${Object.keys(ontology.signals).length} signals)`,
  );

  return { brief, briefMd: mergedBriefMd, ontology };
};

async function loadOntology(requestedVersion: string): Promise<SignalOntology> {
  const selectVersion = (base: SignalOntology): SignalOntology => {
    const selected = requestedVersion === "2.0.0" ? withAvailabilityOntologyV2(base) : base;
    if (selected.version !== requestedVersion) {
      throw new Error(`Requested ontology ${requestedVersion} is unavailable (loaded ${selected.version})`);
    }
    return selected;
  };
  const ontologyPath = path.join(inputDir, "ontology.yaml");
  try {
    const base = await readOntologyFile(ontologyPath);
    return selectVersion(base);
  } catch {
    // Fall back to observatory ontology
    const fallback = path.resolve(inputDir, "..", "..", "observatory", ".input", "ontology.yaml");
    try {
      const loaded = await readOntologyFile(fallback);
      const ont = selectVersion(loaded);
      console.log(
        `[bootstrap] Loaded ontology from observatory fallback; v${ont.version}, ${Object.keys(ont.signals).length} signals`,
      );
      return ont;
    } catch {
      throw new Error(`Cannot load ontology from ${ontologyPath} or fallback ${fallback}`);
    }
  }
}
