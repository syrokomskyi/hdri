/*
<MODULE_CONTRACT>
<purpose>Pure decision for cross-year asset-identity resolution (WP12 + fix): given the requests
seen this run, the durable cross-year vault registry, and the local per-year asset_id_map, decide
which provisional ids reuse an existing canonical id, which mint a fresh one, and which pre-registry
identities must be HEALED into the append-only vault registry. Extracted from MintAssetIdsGogol so
the identity invariants are unit-testable without a DB or vault.</purpose>
<non-goals>
  <item>Does not read the DB or vault, does not write anything — the gogol supplies the maps and
    persists the result (asset_id_map + registry shard).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP12 fix: extract the identity-resolution decision (seed from local map, heal pre-registry
    identities into the registry) into a pure, tested core.</item>
  <item>Inline resolveCanonicalIds (absorbed from @syrokomskyi/observatory-asset-id) — the shallow loop
    is now part of planIdentityResolution, eliminating the pass-through module.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: vault writes are append-only; never mutate or delete existing observations

import { mintAssetId, type IdentityRequest } from "@syrokomskyi/observatory-core";
import type { VaultAssetIdentityRecord } from "@syrokomskyi/observatory-vault";

export type IdentityPlanInputs = {
  /** Distinct provisional (id + domain) pairs seen this run. */
  readonly requests: readonly IdentityRequest[];
  /** provisional → canonical already durable in the cross-year vault registry (all years). */
  readonly vaultRegistry: ReadonlyMap<string, string>;
  /** provisional → canonical already assigned in this year's local DB (asset_id_map). */
  readonly localMap: ReadonlyMap<string, string>;
  /** provisional → domain from the local map, for healing records not present in `requests`. */
  readonly localDomain: ReadonlyMap<string, string>;
  /** provisional → earliest period seen — the true first_seen_period for a healed identity. */
  readonly firstSeenPeriod: ReadonlyMap<string, string>;
  /** Fallback first-seen period (the current brief period) when no earlier period is known. */
  readonly briefPeriod: string;
  readonly mintedAt: string;
  /** Injectable canonical-id generator for deterministic tests. */
  readonly mint?: () => string;
};

export type IdentityPlan = {
  /** Full provisional → canonical map for every requested id (registry ∪ local ∪ freshly minted). */
  readonly resolved: Map<string, string>;
  /** Count of canonical ids freshly minted (genuinely-new businesses). */
  readonly minted: number;
  /** Count reused from the registry or the local map. */
  readonly reused: number;
  /** Count of pre-registry local-map identities healed into the registry (not freshly minted). */
  readonly backfilled: number;
  /** Records to append to the vault registry: fresh mints + healed pre-registry identities. */
  readonly toRegister: VaultAssetIdentityRecord[];
};

/**
 * Resolves each requested provisional id to a canonical id and plans the registry write.
 *
 * Resolution is seeded from the local asset_id_map AND the vault registry (the registry, the
 * cross-year authority, wins the — once healed, impossible — conflict). This is what keeps a
 * pre-registry business (the published Q2 baseline, minted before the registry existed) from
 * being re-minted a fresh canonical id when the registry is still empty for it.
 *
 * `toRegister` is every resolved id NOT already in the vault registry: the freshly-minted ids
 * AND any local-map identity the registry never recorded. Appending the latter self-heals the
 * baseline into the append-only registry, so a later year (fresh DB, empty local map) resolves
 * the same canonical id instead of minting a new one. Idempotent: once the registry carries an
 * id, it is never re-registered.
 */
export function planIdentityResolution(inputs: IdentityPlanInputs): IdentityPlan {
  const existing = new Map<string, string>();
  for (const [pid, cid] of inputs.localMap) existing.set(pid, cid);
  for (const [pid, cid] of inputs.vaultRegistry) existing.set(pid, cid); // registry wins

  const mint = inputs.mint ?? mintAssetId;
  const resolved = new Map<string, string>();
  const newlyMinted: { provisionalId: string; canonicalId: string; domain: string }[] = [];

  for (const { provisionalId, domain } of inputs.requests) {
    if (resolved.has(provisionalId)) continue; // de-dup within this run

    const fromRegistry = existing.get(provisionalId);
    if (fromRegistry !== undefined) {
      resolved.set(provisionalId, fromRegistry);
      continue;
    }

    const canonicalId = mint();
    resolved.set(provisionalId, canonicalId);
    newlyMinted.push({ provisionalId, canonicalId, domain });
  }

  const domainOf = new Map(inputs.requests.map((r) => [r.provisionalId, r.domain]));
  const toRegister: VaultAssetIdentityRecord[] = [];
  for (const [provisionalId, canonicalId] of resolved) {
    if (inputs.vaultRegistry.has(provisionalId)) continue; // already durably registered
    toRegister.push({
      provisional_id: provisionalId,
      canonical_id: canonicalId,
      domain: domainOf.get(provisionalId) || inputs.localDomain.get(provisionalId) || "",
      first_seen_period: inputs.firstSeenPeriod.get(provisionalId) ?? inputs.briefPeriod,
      minted_at: inputs.mintedAt,
    });
  }

  const minted = newlyMinted.length;
  return {
    resolved,
    minted,
    reused: resolved.size - minted,
    backfilled: toRegister.length - minted,
    toRegister,
  };
}
