/*
<MODULE_CONTRACT>
<purpose>Defines version and identification constants for the 3-extract-profile pipeline app.</purpose>
<non-goals>
  <item>Not responsible for configuration loading or environment detection.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
/** Schema version stamped into _schema_meta for pages_YYYY.db. */
export const PAGES_SCHEMA_VERSION = "v2.0";

/** Owner app tag written to _schema_meta. */
export const OWNER_APP = "site-profile";

/** Extractor version tag written to content_extractions.extractor_ver. */
export const RULE_EXTRACTOR_VER = "rule-v3";

/** Human-readable pipeline version for logs and artifacts. */
export const PIPELINE_VER = "v1";

/** app_id written into every emit-bundle manifest. */
export const EMIT_APP_ID = "3-extract-profile";

/** Collector version stamped in emit-bundle manifests (keep in sync with package.json). */
export const COLLECTOR_VERSION = "0.0.1";
