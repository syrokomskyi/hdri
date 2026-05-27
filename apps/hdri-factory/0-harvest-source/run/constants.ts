/*
<MODULE_CONTRACT>
<purpose>Defines constants for schema and application metadata relevant to catalog-harvest.</purpose>
<keywords>constants, schema, metadata</keywords>
<responsibilities>
  <item>Store the schema version for database reference.</item>
  <item>Identify the owner application for metadata tracking.</item>
  <item>Provide a version string for logging and artifact identification.</item>
</responsibilities>
<non-goals>
  <item>Do not include any data processing logic.</item>
  <item>Do not manage configuration settings.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="CORE_SCHEMA_VERSION">Schema version constant</entry>
  <entry key="OWNER_APP">Owner application constant</entry>
  <entry key="PIPELINE_VER">Pipeline version constant</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Introduce constants for schema and application metadata to enhance catalog-harvest clarity.</item>
</CHANGE_SUMMARY>
*/

/** Schema version stamped into _schema_meta for catalog-harvest core.db. */
export const CORE_SCHEMA_VERSION = 'v1.0';

/** Owner app tag written to _schema_meta. */
export const OWNER_APP = 'catalog-harvest';

/** Human-readable pipeline version for logs and artifacts. */
export const PIPELINE_VER = 'v1';

