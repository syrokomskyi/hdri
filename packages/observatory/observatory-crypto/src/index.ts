/*
<MODULE_CONTRACT>
<purpose>Main entry point — re-exports everything so consumers only need one import.</purpose>
<non-goals>
  <item>Do not implement logic directly; delegate to sub-modules.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Export transparency helpers (loadVerificationKeys, verifyUpstreamManifest) for multi-device upstream verification.</item>
  <item>Split device.ts into env.ts, source-token.ts, device-folders.ts. Export from new modules.</item>
  <item>Add deep verifyUpstream entry point to transparency module.</item>
  <item>Add trust-aware verifySignedObservation to verify module.</item>
</CHANGE_SUMMARY>
*/

// Types
export type { SignedObservation, SigningKeyConfig, VerificationKey } from "./types.js";

// Environment loading + device identity (DEVICE_ID env)
export { findRepoRoot, loadRepoEnv, getDeviceId } from "./env.js";

// Source token parsing
export {
  parseSourceToken,
  periodFromSourceToken,
  periodMatchesToken,
  type ParsedSourceToken,
} from "./source-token.js";

// Device folder enumeration
export { isIgnoredDeviceFolder, listDeviceFolders } from "./device-folders.js";

// RFC 8785
export { canonicalize } from "./canonicalize.js";

// Signing
export {
  generateSigningKey,
  loadSigningKey,
  loadSigningKeyFromEnv,
  signObservation,
  signingPayload,
} from "./sign.js";

// Verification
export {
  verifyObservation,
  verifyObservations,
  verifySignedObservation,
  type VerificationResult,
} from "./verify.js";

// Per-source batch signatures (used by each factory app's <N>-sign-source gogol)
export {
  computeRowsetHash,
  signSource,
  verifySourceSignature,
  type SourceSignatureManifest,
} from "./sign-source.js";

// Transparency / multi-device verification
export {
  getTransparencyKeysDir,
  loadVerificationKeys,
  verifyUpstreamManifest,
  verifyUpstream,
  type VerificationKeyMap,
  type UpstreamVerificationResult,
} from "./transparency.js";

// Trusted-key registry (key rotation + validity windows)
export {
  parseTrustedKeysManifest,
  findTrustedKey,
  evaluateKeyTrust,
  type TrustedKeyStatus,
  type TrustedKeyEntry,
  type TrustedKeysManifest,
  type KeyTrust,
} from "./key-registry.js";
