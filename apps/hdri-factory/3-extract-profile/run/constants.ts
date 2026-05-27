/*
<MODULE_CONTRACT>
<purpose>Defines version and identification constants for the 3-extract-profile pipeline app.</purpose>
<keywords>constants, schema version, pipeline version, app id</keywords>
<responsibilities>
  <item>Provide schema version strings for database metadata.</item>
  <item>Declare pipeline, app, and collector identification constants.</item>
</responsibilities>
<non-goals>
  <item>Not responsible for configuration loading or environment detection.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="PAGES_SCHEMA_VERSION">Schema version stamped into _schema_meta for pages_YYYY.db.</entry>
  <entry key="OWNER_APP">Owner app tag written to _schema_meta.</entry>
  <entry key="RULE_EXTRACTOR_VER">Extractor version tag written to content_extractions.extractor_ver.</entry>
  <entry key="PIPELINE_VER">Human-readable pipeline version for logs and artifacts.</entry>
  <entry key="EMIT_APP_ID">app_id written into every emit-bundle manifest.</entry>
  <entry key="COLLECTOR_VERSION">Collector version stamped in emit-bundle manifests.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
/** Schema version stamped into _schema_meta for pages_YYYY.db. */
export const PAGES_SCHEMA_VERSION = 'v2.0';

/** Owner app tag written to _schema_meta. */
export const OWNER_APP = 'site-profile';

/** Extractor version tag written to content_extractions.extractor_ver. */
export const RULE_EXTRACTOR_VER = 'rule-v3';

/** Human-readable pipeline version for logs and artifacts. */
export const PIPELINE_VER = 'v1';

/** app_id written into every emit-bundle manifest. */
export const EMIT_APP_ID = '3-extract-profile';

/** Collector version stamped in emit-bundle manifests (keep in sync with package.json). */
export const COLLECTOR_VERSION = '0.0.1';

