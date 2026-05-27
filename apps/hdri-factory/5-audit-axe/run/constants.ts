/*
<MODULE_CONTRACT>
<purpose>Central constants for the axe audit pipeline app.</purpose>
<keywords>constants, schema, version, app, pipeline</keywords>
<responsibilities>
  <item>Define the schema version stamped into the audit database meta table.</item>
  <item>Declare the owner app tag for audit database provenance.</item>
  <item>Provide a human-readable pipeline version for logs and artifacts.</item>
  <item>Hold the canonical database name prefix used to build axe_{year}.db filenames.</item>
</responsibilities>
<non-goals>
  <item>Does not contain runtime logic, paths, or configuration loading.</item>
  <item>Does not manage per-year or per-run dynamic values.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="AUDITS_SCHEMA_VERSION">Schema version stamped into _schema_meta for axe_YYYY.db.</entry>
  <entry key="OWNER_APP">Owner app tag written to _schema_meta.</entry>
  <entry key="PIPELINE_VER">Human-readable pipeline version for logs and artifacts.</entry>
  <entry key="AUDITS_DB_PREFIX">Canonical database name prefix — actual filename is axe_{year}.db.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
/** Schema version stamped into _schema_meta for axe_YYYY.db. */
export const AUDITS_SCHEMA_VERSION = 'v1.0';

/** Owner app tag written to _schema_meta. */
export const OWNER_APP = 'site-axe-audit';

/** Human-readable pipeline version for logs and artifacts. */
export const PIPELINE_VER = 'v1';

/** Canonical DB name prefix — actual filename is axe_{year}.db. */
export const AUDITS_DB_PREFIX = 'axe';

