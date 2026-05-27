/*
<MODULE_CONTRACT>
<purpose>Abstract base class for all gogols in the site-liveness pipeline.</purpose>
<keywords>pipeline, gogol, abstraction</keywords>
<responsibilities>
  <item>Provide the shared HdriFactoryGogol base wired to app-specific PipelineContext.</item>
</responsibilities>
<non-goals>
  <item>Do not implement concrete processing logic.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="Gogol">Shared base class for site-liveness gogols.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Replace local boilerplate with shared HdriFactoryGogol from @org/hdri-factory-core.</item>
</CHANGE_SUMMARY>
*/

import { HdriFactoryGogol } from '@org/hdri-factory-core';
import type { PipelineContext } from './types.js';

export abstract class Gogol extends HdriFactoryGogol<PipelineContext> {}

