/*
<MODULE_CONTRACT>
<purpose>Defines constants for schema and application metadata relevant to catalog-harvest.</purpose>
<non-goals>
  <item>Do not include any data processing logic.</item>
  <item>Do not manage configuration settings.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Introduce constants for schema and application metadata to enhance catalog-harvest clarity.</item>
</CHANGE_SUMMARY>
*/

/** Schema version stamped into _schema_meta for catalog-harvest core.db. */
export const CORE_SCHEMA_VERSION = "v1.0";

/** Owner app tag written to _schema_meta. */
export const OWNER_APP = "catalog-harvest";

/** Human-readable pipeline version for logs and artifacts. */
export const PIPELINE_VER = "v1";
