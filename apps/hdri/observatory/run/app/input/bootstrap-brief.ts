/*
<MODULE_CONTRACT>
<purpose>Loads and validates the observatory brief from .input/brief.md — this module handles bootstrap-brief operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not validate source data availability — that is done by gogols.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for observatory.</item>
  <item>Fix brief template to use canonical lowercase period format (2025-q2).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PipelinePauseError } from "@syrokomskyi/pipeline-core";
import { inputDir } from "../../config";
import { parseBriefMarkdown, type Brief } from "../../brief";

const BRIEF_TEMPLATE = `---
outputLanguage: de
period: "2025-q2"
capsuleId: "0198f3a4-5b6c-7d8e-9f01-234567890abc"
ontologyVersion: "1.0.0"
codebookVersion: "hdri-v1.0.0"
factoryContractRootDir: "../factory/a-contract-ontology"
publicMode: false
skipGogols: []
---

Digital Observatory run brief.
`;

export const bootstrapBrief = async (): Promise<{ brief: Brief }> => {
  const briefPath = path.join(inputDir, "brief.md");

  let briefMd: string;
  try {
    briefMd = await readFile(briefPath, "utf-8");
  } catch {
    throw new PipelinePauseError(
      `Missing .input/brief.md — create it at:\n  ${briefPath}\n\nTemplate:\n\n${BRIEF_TEMPLATE}`,
    );
  }

  if (!briefMd.trim()) {
    throw new PipelinePauseError(
      `Empty .input/brief.md — fill it in at:\n  ${briefPath}\n\nTemplate:\n\n${BRIEF_TEMPLATE}`,
    );
  }

  const brief = parseBriefMarkdown(briefMd);
  return { brief };
};
