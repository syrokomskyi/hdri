/*
<MODULE_CONTRACT>
<purpose>Parses command-line arguments for the observatory pipeline.</purpose>
<keywords>CLI, options parsing</keywords>
<responsibilities>
  <item>Validates and extracts flags: --from, --to, --only, --force, --dry-run.</item>
  <item>Throws on unknown options.</item>
</responsibilities>
<non-goals>
  <item>Do not implement business logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="parseRunOptions">Parses argv into PipelineRunOptions.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation for digital-observatory.</item>
</CHANGE_SUMMARY>
*/

import type { PipelineRunOptions } from '@org/pipeline-core';

const readValue = (args: string[], index: number, flag: string): string => {
  const value = args[index + 1]?.trim();
  if (!value) throw new Error(`Missing value for ${flag}`);
  return value;
};

const splitList = (value: string): string[] =>
  value.split(',').map((item) => item.trim()).filter(Boolean);

export const parseRunOptions = (argv: string[]): PipelineRunOptions => {
  const options: PipelineRunOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') { options.dryRun = true; continue; }
    if (arg === '--from') { options.from = readValue(argv, index, arg); index += 1; continue; }
    if (arg === '--to') { options.to = readValue(argv, index, arg); index += 1; continue; }
    if (arg === '--only') { options.only = splitList(readValue(argv, index, arg)); index += 1; continue; }
    if (arg === '--force') { options.force = splitList(readValue(argv, index, arg)); index += 1; continue; }

    throw new Error(`Unknown CLI option: ${arg}`);
  }

  return options;
};
