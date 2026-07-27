/*
<MODULE_CONTRACT>
<purpose>Defines the abstract structure for Gogol pipeline steps, facilitating the execution of specific processing tasks within the pipeline framework.</purpose>
<non-goals>
  <item>Do not implement concrete processing logic; this is the responsibility of subclasses.</item>
  <item>Do not handle raw content parsing or data validation within this class.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Replace local boilerplate with shared HdriFactoryGogol from @syrokomskyi/factory-core.</item>
</CHANGE_SUMMARY>
*/

import { HdriFactoryGogol } from "@syrokomskyi/factory-core";
import type { PipelineContext } from "./types.js";

export abstract class Gogol extends HdriFactoryGogol<PipelineContext> {}
