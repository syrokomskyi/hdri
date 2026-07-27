/*
<MODULE_CONTRACT>
<purpose>Abstract base class for all contract-ontology gogols — this module handles  operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not implement concrete processing logic — subclasses define that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation for contract-ontology pipeline conversion.</item>
  <item>Replace local boilerplate with shared HdriFactoryGogol from @syrokomskyi/factory-core.</item>
</CHANGE_SUMMARY>
*/

import { HdriFactoryGogol } from "@syrokomskyi/factory-core";
import type { PipelineContext } from "./types.js";

export abstract class Gogol extends HdriFactoryGogol<PipelineContext> {}
