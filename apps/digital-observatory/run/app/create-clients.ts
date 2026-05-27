/*
<MODULE_CONTRACT>
<purpose>Creates external service clients required by the observatory pipeline.</purpose>
<keywords>clients, initialization</keywords>
<responsibilities>
  <item>Instantiates clients for external services used by gogols.</item>
  <item>Currently empty — observatory pipeline has no AI providers.</item>
</responsibilities>
<non-goals>
  <item>Do not instantiate clients the app does not use.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="createClients">Factory for pipeline service clients.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation — no external AI providers needed for observatory.</item>
</CHANGE_SUMMARY>
*/

export type ObservatoryClients = Record<string, never>;

export const createClients = (): ObservatoryClients => ({});
