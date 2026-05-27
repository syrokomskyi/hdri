/*
<MODULE_CONTRACT>
<purpose>Defines directory paths for input, output, and pipeline resources.</purpose>
<keywords>directory management, path resolution</keywords>
<responsibilities>
  <item>Constructs absolute paths for input and output directories.</item>
  <item>Exports directory paths for use in other modules.</item>
</responsibilities>
<non-goals>
  <item>Do not handle file reading or writing operations.</item>
  <item>Do not manage configuration settings beyond directory paths.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="inputDir">Path to .input directory.</entry>
  <entry key="outputRootDir">Path to .output directory.</entry>
  <entry key="promptsDir">Path to prompts directory.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation of config for digital-observatory app.</item>
</CHANGE_SUMMARY>
*/

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

export const inputDir = path.join(rootDir, '.input');
export const outputRootDir = path.join(rootDir, '.output');
export const promptsDir = path.join(scriptDir, 'prompts');
