// Types
export type { SignedObservation, SigningKeyConfig, VerificationKey } from './types.js';

// Device identity (DEVICE_ID env)
export {
  findRepoRoot,
  getDeviceId,
  isIgnoredDeviceFolder,
  listDeviceFolders,
  loadRepoEnv,
  parseSourceToken,
  periodFromSourceToken,
  periodMatchesToken,
  type ParsedSourceToken,
} from './device.js';

// RFC 8785
export { canonicalize } from './canonicalize.js';

/*
<MODULE_CONTRACT>
<purpose>Main entry point — re-exports everything so consumers only need one import.</purpose>
<keywords>crypto, signing, verification, transparency, ed25519</keywords>
<responsibilities>
  <item>Re-export all public APIs from sub-modules.</item>
</responsibilities>
<non-goals>
  <item>Do not implement logic directly; delegate to sub-modules.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="index.ts">Central export point for @org/observatory-crypto.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
  <item>Export transparency helpers (loadVerificationKeys, verifyUpstreamManifest) for multi-device upstream verification.</item>
</CHANGE_SUMMARY>
*/

// Signing
export {
  generateSigningKey,
  loadSigningKey,
  loadSigningKeyFromEnv,
  signObservation,
  signingPayload,
} from './sign.js';

// Verification
export { verifyObservation, verifyObservations } from './verify.js';

// Per-source batch signatures (used by each factory app's <N>-sign-source gogol)
export {
  computeRowsetHash,
  signSource,
  verifySourceSignature,
  type SourceSignatureManifest,
} from './sign-source.js';

// Transparency / multi-device verification
export {
  getTransparencyKeysDir,
  loadVerificationKeys,
  verifyUpstreamManifest,
  type VerificationKeyMap,
  type UpstreamVerificationResult,
} from './transparency.js';
