/*
<MODULE_CONTRACT>
<purpose>Ambient TypeScript declarations for the subset of the untyped `opentimestamps`
package used by timestamp-publication.ts, so the module is typed rather than `any` (finding 2).</purpose>
<non-goals>
  <item>Not a full binding — widen only as the CLI grows to use more of the API.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Finding 2: minimal ambient types for OpenTimestamps anchoring.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: timestamps are RFC 3161 trusted; never accept unverified timestamp tokens

/**
 * Minimal ambient types for the subset of `opentimestamps` we use (the package
 * ships no declarations). Covers detached-file construction, stamp/verify/upgrade — enough to
 * anchor and check a publication digest. Widen as needed; do not turn the module into `any`.
 */
declare module "opentimestamps" {
  export interface DetachedTimestampFileInstance {
    serializeToBytes(): Uint8Array;
  }

  export namespace Ops {
    class OpSHA256 {}
  }

  export const DetachedTimestampFile: {
    fromHash(op: Ops.OpSHA256, hash: Buffer): DetachedTimestampFileInstance;
    deserialize(bytes: Uint8Array): DetachedTimestampFileInstance;
  };

  export function stamp(detached: DetachedTimestampFileInstance): Promise<void>;
  export function verify(
    detachedOts: DetachedTimestampFileInstance,
    detachedOriginal: DetachedTimestampFileInstance,
  ): Promise<Record<string, unknown>>;
  export function upgrade(detached: DetachedTimestampFileInstance): Promise<boolean>;
}
