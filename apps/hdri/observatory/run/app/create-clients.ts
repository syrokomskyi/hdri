/*
<MODULE_CONTRACT>
<purpose>Creates external service clients required by the observatory pipeline — this module handles create-clients operations within the pipeline application.</purpose>
<non-goals>
  <item>Do not instantiate clients the app does not use.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.summary.trim; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

export type ObservatoryClients = Record<string, never>;

export const createClients = (): ObservatoryClients => ({});
