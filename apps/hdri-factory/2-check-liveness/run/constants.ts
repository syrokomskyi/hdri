/*
<MODULE_CONTRACT>
<purpose>Defines shared constant values for the check-liveness pipeline app.</purpose>
<keywords>constants, schema-version, app-tag, pipeline-version</keywords>
<responsibilities>
  <item>Declares the schema version stamped into _schema_meta in the liveness database.</item>
  <item>Declares the owner app tag written into _schema_meta.</item>
  <item>Declares the human-readable pipeline version string.</item>
</responsibilities>
<non-goals>
  <item>Does not contain any runtime logic or configuration derived from environment.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="LIVENESS_SCHEMA_VERSION">Schema version string for the liveness database.</entry>
  <entry key="OWNER_APP">Owner app tag for database metadata.</entry>
  <entry key="PIPELINE_VER">Human-readable pipeline version for logs and artifacts.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
/** Schema version stamped into _schema_meta for site-liveness liveness.db. */
export const LIVENESS_SCHEMA_VERSION = 'v1.0';

/** Owner app tag written to _schema_meta. */
export const OWNER_APP = 'site-liveness';

/** Human-readable pipeline version for logs and artifacts. */
export const PIPELINE_VER = 'v1';

