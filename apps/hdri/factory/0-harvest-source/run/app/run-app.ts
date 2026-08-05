/*
<MODULE_CONTRACT>
<purpose>Facilitates the execution of the catalog harvest pipeline, managing input and output directories.</purpose>
<non-goals>
  <item>Do not handle raw data parsing or validation within this module.</item>
  <item>Do not manage configuration or orchestration of transport layers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added COMPASS scaffolding to define module purpose, responsibilities, and boundaries.</item>
  <item>Phase B cleanup: derive year/quarter from sourceToken instead of removed deprecated fields.</item>
  <item>Discover the current folder plus every preserved earlier batch for cumulative rebuild.</item>
  <item>Add maxSites logging at pipeline start for operational visibility.</item>
  <item>Replace maxSites log with maxPages log.</item>
  <item>Pass rootBrief into pipeline initialState so gogols can read factory-level configuration.</item>
  <item>RFC-0043: wire validateBriefConsistency() guard after bootstrapBrief, before bootstrapBatches. Add --first-quarter / FIRST_QUARTER env var support.</item>
  <item>RFC-0067: parse prior-capsules.json for capsuleIds and pass to guard.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import matter from "gray-matter";
import {
  createPipelineExecutionGuide,
  formatPipelineFinished,
  formatPipelineOverview,
  formatPipelineStart,
} from "@syrokomskyi/pipeline-core";
import { PipelinePauseError } from "@syrokomskyi/pipeline-core";
import { ensureOutputDir, fileExists, readTextFile } from "@syrokomskyi/pipeline-node/context";
import { validateBriefConsistency, parsePriorCapsulesFile } from "@syrokomskyi/factory-core";
import { inputDir, outputRootDir } from "../config.js";
import { createPipeline } from "../pipeline.js";
import { type PipelineRunOptions, runPipelineEngine } from "../pipeline/engine.js";
import { bootstrapBatches } from "./input/bootstrap-batches.js";
import { bootstrapBrief } from "./input/bootstrap-brief.js";

const isFirstQuarter =
  process.argv.includes("--first-quarter") || process.env.FIRST_QUARTER === "true";

const readSiblingBriefField = async (
  briefPath: string,
  briefName: string,
): Promise<{ period: string; capsuleId: string }> => {
  const exists = await fileExists(briefPath);
  if (!exists) {
    throw new PipelinePauseError(
      [
        "Pipeline paused.",
        `${briefName} brief not found at ${briefPath}.`,
        "Set up all briefs before running the factory per RUNBOOK pre-flight checklist.",
      ].join("\n"),
    );
  }
  const raw = await readTextFile(briefPath);
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const period = typeof data.period === "string" ? data.period.trim().toLowerCase() : "";
  const capsuleId = typeof data.capsuleId === "string" ? data.capsuleId.trim().toLowerCase() : "";
  if (!period || !capsuleId) {
    throw new PipelinePauseError(
      [
        "Pipeline paused.",
        `${briefName} brief at ${briefPath} is missing period or capsuleId.`,
        "Ensure both fields are set.",
      ].join("\n"),
    );
  }
  return { period, capsuleId };
};

export const runApp = async (options: PipelineRunOptions = {}): Promise<void> => {
  await ensureOutputDir(inputDir);
  await ensureOutputDir(outputRootDir);

  const { brief, rootBrief } = await bootstrapBrief();

  // Pre-flight consistency guard (RFC-0043)
  const factoryRootDir = path.resolve(inputDir, "..");
  const contractOntologyBriefPath = path.join(
    factoryRootDir,
    "a-contract-ontology",
    ".input",
    "brief.md",
  );
  const observatoryBriefPath = path.resolve(
    factoryRootDir,
    "..",
    "observatory",
    ".input",
    "brief.md",
  );
  const contractOntologyBrief = await readSiblingBriefField(
    contractOntologyBriefPath,
    "Contract ontology",
  );
  const observatoryBrief = await readSiblingBriefField(observatoryBriefPath, "Observatory");
  const priorCapsulesExists = await fileExists(path.join(inputDir, "prior-capsules.json"));
  const priorCapsuleIds = priorCapsulesExists
    ? parsePriorCapsulesFile(
        await readTextFile(path.join(inputDir, "prior-capsules.json")),
      ).priorCapsules.map((e) => e.capsuleId)
    : [];

  validateBriefConsistency({
    factoryRootBrief: { sourceToken: brief.sourceToken, capsuleId: brief.capsuleId },
    contractOntologyBrief,
    observatoryBrief,
    priorCapsulesExists,
    isFirstQuarter,
    priorCapsuleIds,
  });

  const { batchNames, discovery } = await bootstrapBatches(brief, isFirstQuarter);

  console.log(`\n[catalog-harvest] Batches found: ${batchNames.join(", ")}`);
  console.log(`[catalog-harvest] maxPages: ${brief.maxPages}\n`);

  const pipeline = createPipeline();
  const guide = createPipelineExecutionGuide(pipeline);

  console.log(
    `\n${formatPipelineStart({
      inputDir,
      outputDir: outputRootDir,
      pipelineTitle: guide.title,
    })}`,
  );
  console.log(formatPipelineOverview(guide));

  await runPipelineEngine({
    gogols: pipeline.steps,
    guide,
    clients: {},
    initialState: {
      batchNames,
      brief,
      rootBrief,
      discovery,
    },
    options,
  });

  console.log(
    `\n${formatPipelineFinished({
      outputDir: outputRootDir,
      pipelineTitle: guide.title,
    })}`,
  );
};
