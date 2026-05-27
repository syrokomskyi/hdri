/*
<MODULE_CONTRACT>
<purpose>Canonical constants for the Lighthouse audit pipeline app.</purpose>
<keywords>constants, schema, version, db-prefix</keywords>
<responsibilities>
  <item>Define the schema version stamped into Lighthouse audit databases.</item>
  <item>Define the owner app tag for metadata tracking.</item>
  <item>Define the human-readable pipeline version for logs and artifacts.</item>
  <item>Define the canonical database name prefix for Lighthouse databases.</item>
</responsibilities>
<non-goals>
  <item>Does not contain any runtime logic or configuration loading.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="AUDITS_SCHEMA_VERSION">Schema version string stamped into _schema_meta.</entry>
  <entry key="OWNER_APP">Owner app tag written to _schema_meta.</entry>
  <entry key="PIPELINE_VER">Human-readable pipeline version for logs and artifacts.</entry>
  <entry key="AUDITS_DB_PREFIX">Canonical DB name prefix (lighthouse).</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation with GRACE scaffolding.</item>
</CHANGE_SUMMARY>
*/
/** Schema version stamped into _schema_meta for lighthouse_YYYY.db. */
export const AUDITS_SCHEMA_VERSION = 'v1.0';

/** Owner app tag written to _schema_meta. */
export const OWNER_APP = 'site-lighthouse-audit';

/** Human-readable pipeline version for logs and artifacts. */
export const PIPELINE_VER = 'v1';

/** Canonical DB name prefix — actual filename is lighthouse_{year}.db. */
export const AUDITS_DB_PREFIX = 'lighthouse';

