/*
<MODULE_CONTRACT>
<purpose>Abstract base class for all gogols in the site-liveness pipeline.</purpose>
<non-goals>
  <item>Do not implement concrete processing logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Replace local boilerplate with shared HdriFactoryGogol from @syrokomskyi/factory-core.</item>
</CHANGE_SUMMARY>
*/

import { HdriFactoryGogol } from "@syrokomskyi/factory-core";
import type { PipelineContext } from "./types.js";

export abstract class Gogol extends HdriFactoryGogol<PipelineContext> {}
