/*
<MODULE_CONTRACT>
<purpose>Defines the abstract structure for Gogol pipeline steps, facilitating the execution of specific processing tasks within the pipeline framework.</purpose>
<keywords>pipeline, abstraction, artifacts</keywords>
<responsibilities>
  <item>Manages artifacts associated with the Gogol pipeline steps.</item>
  <item>Provides a method to retrieve the artifact path based on the pipeline context.</item>
  <item>Determines whether the step should be skipped based on the current state.</item>
  <item>Requires subclasses to implement the run method for specific processing logic.</item>
</responsibilities>
<non-goals>
  <item>Do not implement concrete processing logic; this is the responsibility of subclasses.</item>
  <item>Do not handle raw content parsing or data validation within this class.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="artifacts">artifacts</entry>
  <entry key="promptFileNames">getPromptFileNames</entry>
  <entry key="artifactPath">getArtifactPath</entry>
  <entry key="shouldSkip">shouldSkip</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Replace local boilerplate with shared HdriFactoryGogol from @org/hdri-factory-core.</item>
</CHANGE_SUMMARY>
*/

import { HdriFactoryGogol } from '@org/hdri-factory-core';
import type { PipelineContext } from './types.js';

export abstract class Gogol extends HdriFactoryGogol<PipelineContext> {}
