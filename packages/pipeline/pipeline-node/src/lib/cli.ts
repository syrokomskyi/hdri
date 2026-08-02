/*
<MODULE_CONTRACT>
<purpose>Provides shared CLI argument parsing and main entry point factory for pipeline apps, eliminating boilerplate in main.ts and parse-run-options.ts.</purpose>
<non-goals>
  <item>Does not define app-specific business logic or pipeline execution.</item>
  <item>Does not handle environment variable management beyond dotenv initialization.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of parseRunOptions and createMainEntry factory.</item>
  <item>Added optional onEvent callback to createMainEntry, propagated to runApp.</item>
  <item>Auto-wire webhook event bridge in createMainEntry when WEBHOOK_URL env is set.</item>
</CHANGE_SUMMARY>
*/

import dotenv from "dotenv";
import {
  formatPipelineError,
  formatPipelinePaused,
  PipelinePauseError,
  type PipelineEventCallback,
  type PipelineRunOptions,
} from "@syrokomskyi/pipeline-core";
import { createWebhookEventBridge } from "./webhook-event-bridge.js";

const readValue = (args: string[], index: number, flag: string): string => {
  const value = args[index + 1]?.trim();
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
};

const splitList = (value: string): string[] => {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

/**
 * Parses standard pipeline CLI arguments into `PipelineRunOptions`.
 *
 * Supported flags:
 * - `--dry-run` — enable dry-run mode
 * - `--from <id>` — start from a specific step
 * - `--to <id>` — stop after a specific step
 * - `--only <id,id,...>` — run only specific steps
 * - `--force <id,id,...>` — force re-run of specific steps
 */
export const parseRunOptions = (argv: string[]): PipelineRunOptions => {
  const options: PipelineRunOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--from") {
      options.from = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--to") {
      options.to = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--only") {
      options.only = splitList(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = splitList(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown CLI option: ${arg}`);
  }

  return options;
};

/**
 * Creates a standard pipeline main entry point. Calls `dotenv.config()`,
 * parses CLI arguments with `parseRunOptions`, runs the app, and handles
 * `PipelinePauseError` (exit code 2) and general errors (exit code 1).
 *
 * Usage in app main.ts:
 * ```ts
 * import { createMainEntry } from "@syrokomskyi/pipeline-node/cli";
 * import { runApp } from "./app/run-app.js";
 *
 * createMainEntry({ runApp });
 * ```
 */
export const createMainEntry = (options: {
  runApp: (runOptions: PipelineRunOptions, onEvent?: PipelineEventCallback) => Promise<void>;
  onEvent?: PipelineEventCallback;
}): void => {
  dotenv.config();

  const webhookBridge = createWebhookEventBridge();
  const onEvent = options.onEvent ?? webhookBridge;

  const main = async (): Promise<void> => {
    try {
      const runOptions = parseRunOptions(process.argv.slice(2));
      await options.runApp(runOptions, onEvent);
    } catch (error) {
      if (error instanceof PipelinePauseError) {
        console.log(`\n${formatPipelinePaused(error.message)}`);
        process.exitCode = 2;
        return;
      }

      console.error(`\n${formatPipelineError(error)}`);
      process.exitCode = 1;
    }
  };

  void main();
};
