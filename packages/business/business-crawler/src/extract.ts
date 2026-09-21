/*
<MODULE_CONTRACT>
<purpose>This module serves as a thin re-export layer to maintain the existing export path for the extract functionality.</purpose>
<non-goals>
  <item>This module does not implement any extract functionality itself.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.summary.trim; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

// Thin re-export — implementation lives in src/extract/
// Keep this file so the existing package.json export path "./extract" still resolves.
export * from "./extract/index.js";
