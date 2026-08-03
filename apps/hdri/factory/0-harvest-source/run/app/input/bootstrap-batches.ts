/*
<MODULE_CONTRACT>
<purpose>Discovers source batches from prior capsule segments and the current quarter's input folder to build a cumulative frame.</purpose>
<non-goals>
  <item>Does not re-parse old raw folders; prior segments are read from sealed capsule manifests.</item>
  <item>Does not modify or delete sealed capsules or their artifacts.</item>
  <item>Do not include future-quarter folders in the current frozen frame.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Enhanced COMPASS scaffolding to accurately reflect module responsibilities and boundaries.</item>
  <item>Discover preserved prior-quarter folders together with the current new-source folder.</item>
  <item>Update COMPASS header to reflect cumulative capsule discovery contract (RFC-0030).</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { PipelinePauseError } from "@syrokomskyi/pipeline-core";
import type { Brief } from "../../brief.js";
import { getBatchInputDir } from "../../paths.js";
import { listBatchNames } from "../../source-files.js";
import { selectCumulativeBatchNames } from "./batch-selection.js";

export type BootstrappedBatches = {
  batchNames: string[];
};

export const bootstrapBatches = async (brief: Brief): Promise<BootstrappedBatches> => {
  let discovered: string[];

  try {
    discovered = await listBatchNames();
    const stat = await fs.stat(getBatchInputDir(brief.sourceToken));
    if (!stat.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw new PipelinePauseError(
      [
        "Pipeline paused.",
        `Batch directory not found: ${getBatchInputDir(brief.sourceToken)}`,
        `The current folder name must exactly match sourceToken from brief.md ("${brief.sourceToken}").`,
        "",
        "Expected structure:",
        `  .input/batches/${brief.sourceToken}/firmenabc.com/*.csv`,
        `  .input/batches/${brief.sourceToken}/<city>.stadtbranchenbuch.com/*.html`,
        `  .input/batches/${brief.sourceToken}/branchenverzeichnis.org/**/*.html`,
        `  .input/batches/${brief.sourceToken}/work5.de/**/*.html`,
      ].join("\n"),
    );
  }

  return { batchNames: selectCumulativeBatchNames(discovered, brief.sourceToken) };
};
