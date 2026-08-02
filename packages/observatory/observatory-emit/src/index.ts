/*
<MODULE_CONTRACT>
<purpose>Exports types, schemas, and utilities for managing and verifying emit bundles and manifests.</purpose>
<non-goals>
  <item>Does not implement the actual logic for emitting bundles or manifests.</item>
  <item>Does not handle network operations or external API interactions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial export setup for types, schemas, and utility functions.</item>
</CHANGE_SUMMARY>
*/

// Types
export type { EmitBundle, EmitFormat, EmitManifest } from "./types.js";

// Runtime contract schema
export { EmitManifestSchema, parseEmitManifest } from "./schema.js";
export type { EmitManifestFromSchema } from "./schema.js";

// Writer
export { EmitBundleWriter } from "./writer.js";

// Reader
export {
  readEmitBundle,
  readEmitManifest,
  streamAssetStates,
  streamObservations,
} from "./reader.js";
