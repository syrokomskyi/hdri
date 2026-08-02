/*
<MODULE_CONTRACT>
<purpose>This module serves as an entry point for various database-related functionalities, including schema definitions, migrations, ID management, and cross-database operations.</purpose>
<non-goals>
  <item>This module does not implement the actual database logic or handle database connections.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial export setup for schema, migrations, ID management, gewerk classification, and cross-database helpers.</item>
</CHANGE_SUMMARY>
*/

// Schema (Drizzle table definitions)
export * from "./schema/index.js";

// Migrations (raw DDL + meta stamping)
export * from "./migrate/index.js";

// IDs, domain normalisation, stop-domain list
export * from "./ids/index.js";

// Gewerk classification
export * from "./gewerk/index.js";

// Cross-database ATTACH helpers
export * from "./cross-db.js";
