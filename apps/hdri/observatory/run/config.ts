/*
<MODULE_CONTRACT>
<purpose>Defines directory paths for input, output, and pipeline resources — this module handles config operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not handle file reading or writing operations.</item>
  <item>Do not manage configuration settings beyond directory paths.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Replace hand-rolled path boilerplate with createAppPaths from @warpgogol/pipeline-node/paths.</item>
</CHANGE_SUMMARY>
*/

import { createAppPaths } from "@warpgogol/pipeline-node/paths";

export const { inputDir, outputRootDir, promptsDir } = createAppPaths({
  moduleUrl: import.meta.url,
});
