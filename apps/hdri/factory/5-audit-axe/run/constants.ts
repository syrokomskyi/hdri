/*
<MODULE_CONTRACT>
<purpose>Central constants for the axe audit pipeline app — this module handles constants operations within the pipeline application.</purpose>
<non-goals>
  <item>Does not contain runtime logic, paths, or configuration loading.</item>
  <item>Does not manage per-year or per-run dynamic values.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation with COMPASS scaffolding.</item>
</CHANGE_SUMMARY>
*/
/** Schema version stamped into _schema_meta for axe_YYYY.db. */
export const AUDITS_SCHEMA_VERSION = "v1.0";

/** Owner app tag written to _schema_meta. */
export const OWNER_APP = "site-axe-audit";

/** Human-readable pipeline version for logs and artifacts. */
export const PIPELINE_VER = "v1";

/** Canonical DB name prefix — actual filename is axe_{year}.db. */
export const AUDITS_DB_PREFIX = "axe";
