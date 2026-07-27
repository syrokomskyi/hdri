/*
<MODULE_CONTRACT>
<purpose>Defines shared constant values for the check-liveness pipeline app — this module handles constants operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not contain any runtime logic or configuration derived from environment.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
/** Schema version stamped into _schema_meta for site-liveness liveness.db. */
export const LIVENESS_SCHEMA_VERSION = "v1.0";

/** Owner app tag written to _schema_meta. */
export const OWNER_APP = "site-liveness";

/** Human-readable pipeline version for logs and artifacts. */
export const PIPELINE_VER = "v1";
