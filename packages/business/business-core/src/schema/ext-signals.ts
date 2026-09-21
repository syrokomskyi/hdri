/*
<MODULE_CONTRACT>
<purpose>Re-export barrel for all ext_* signal table definitions, split by signal group.</purpose>
<non-goals>
  <item>Does not define page_contents, site_pages, or page_observations — those live in pages.ts.</item>
  <item>Does not handle migrations — see migrate/pages.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Split monolithic ext-signals.ts into focused modules: ext-schema-org, ext-content, ext-legal, ext-links, ext-social, ext-special.</item>
  <item>This file is now a thin re-export barrel preserving the original export surface.</item>
</CHANGE_SUMMARY>
*/

export * from "./ext-schema-org.js";
export * from "./ext-content.js";
export * from "./ext-legal.js";
export * from "./ext-links.js";
export * from "./ext-social.js";
export * from "./ext-special.js";
