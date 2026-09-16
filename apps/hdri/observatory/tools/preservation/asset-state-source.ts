/*
<MODULE_CONTRACT>
<purpose>Project complete retained harvest sites and mappings into canonical current AssetStateRecord values with explicit lineage.</purpose>
<non-goals>
  <item>Does not authenticate the supplied domain-to-canonical map or write a target database.</item>
  <item>Does not discard retained source-only confidence or creation metadata.</item>
</non-goals>
<!-- risk: vault -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A1: add bounded source-scoped AssetState projection with canonical identity joins.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: A projected row is not admitted until its identity map, target bytes and comparison closure are independently verified.

import type { AssetStateRecord } from "@syrokomskyi/observatory-core";
import { assertBaselineCanonicalId, MAX_BASELINE_IDENTITIES } from "./contracts.js";
import {
  streamPreparedHarvestMappings,
  streamPreparedHarvestSites,
  type RetainedHarvestMapping,
} from "./harvest-source.js";
import {
  assertBaselineScopeInventory,
  type BaselineScopeInventory,
  type BaselineSourceClaim,
} from "./baseline-scope.js";
import {
  assertPreparedBaselineSource,
  type PreparedBaselineSource,
} from "./preserve.js";

export type RetainedAssetStateProjection = Readonly<{
  record: AssetStateRecord;
  retained: Readonly<{
    localSiteId: string;
    hwoConfidence: number | null;
    createdAt: string | null;
  }>;
  source: Readonly<{
    manifestSha256: string;
    scope: BaselineSourceClaim;
    artifact: Readonly<{ uri: string; sha256: string; bytes: number }>;
    siteLocator: Readonly<{ table: "sites"; id: string }>;
    mappingLocators: readonly Readonly<{
      table: "site_hwo_mappings";
      site_id: string;
      mapping_system: string;
    }>[];
  }>;
}>;

function text(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Buffer.byteLength(value) > 4096 ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 0x1f || code === 0x7f;
    })
  )
    throw new Error(`INVALID_ASSET_STATE_${label}`);
  return value;
}

function mappingSiteId(row: RetainedHarvestMapping): bigint {
  const value = row.columns.site_id;
  if (typeof value !== "bigint") throw new Error("INVALID_ASSET_STATE_MAPPING_SITE");
  return value;
}

/** The canonical map must come from a separately verified complete identity domain.
 * It is detached synchronously so caller mutation cannot change an in-flight join. */
export function streamPreparedAssetStates(options: Readonly<{
  prepared: PreparedBaselineSource;
  scopeInventory: BaselineScopeInventory;
  snapshotUri: string;
  canonicalByDomain: ReadonlyMap<string, string>;
}>): AsyncGenerator<RetainedAssetStateProjection> {
  assertPreparedBaselineSource(options.prepared);
  assertBaselineScopeInventory(options.scopeInventory);
  if (options.scopeInventory.manifestSha256 !== options.prepared.manifestSha256)
    throw new Error("ASSET_STATE_SCOPE_MANIFEST_MISMATCH");
  const scoped = options.scopeInventory.sources.find(
    (source) => source.declaration.snapshot.uri === options.snapshotUri,
  );
  if (!scoped || scoped.declaration.profile !== "harvest")
    throw new Error("HARVEST_BASELINE_SCOPE_REQUIRED");
  if (!(options.canonicalByDomain instanceof Map) || !options.canonicalByDomain.size)
    throw new Error("NONEMPTY_CANONICAL_DOMAIN_MAP_REQUIRED");
  if (options.canonicalByDomain.size > MAX_BASELINE_IDENTITIES)
    throw new Error("CANONICAL_DOMAIN_MAP_LIMIT");
  const canonicalByDomain = new Map<string, string>();
  for (const [rawDomain, rawCanonicalId] of options.canonicalByDomain) {
    const domain = text(rawDomain, "DOMAIN");
    assertBaselineCanonicalId(rawCanonicalId);
    canonicalByDomain.set(domain, rawCanonicalId);
  }
  const sourceScope = scoped.declaration.scope;

  return (async function* () {
    const mappings = streamPreparedHarvestMappings(options.prepared, options.snapshotUri);
    let nextMapping = await mappings.next();
    try {
      for await (const site of streamPreparedHarvestSites(options.prepared, options.snapshotUri)) {
        const localSiteId = site.columns.id;
        const domain = site.columns.domain;
        if (typeof localSiteId !== "bigint" || typeof domain !== "string")
          throw new Error("INVALID_ASSET_STATE_SITE");
        if (!nextMapping.done && mappingSiteId(nextMapping.value) < localSiteId)
          throw new Error("ORPHAN_ASSET_STATE_MAPPING");
        const siteMappings: RetainedHarvestMapping[] = [];
        while (!nextMapping.done && mappingSiteId(nextMapping.value) === localSiteId) {
          siteMappings.push(nextMapping.value);
          nextMapping = await mappings.next();
        }
        const canonicalId = canonicalByDomain.get(domain);
        if (!canonicalId) throw new Error(`UNRESOLVED_ASSET_STATE_DOMAIN: ${domain}`);
        const mappingsForRecord = siteMappings.map((mapping) =>
          Object.freeze({
            mapping_system: mapping.columns.mapping_system as string,
            target_code: mapping.columns.target_code as string,
            target_label: mapping.columns.target_label as string | null,
            source: mapping.columns.source as string,
          }),
        );
        const destatis = mappingsForRecord.find(
          (mapping) => mapping.mapping_system === "destatis_group",
        );
        const record: AssetStateRecord = Object.freeze({
          asset_id: canonicalId,
          domain,
          gewerk_group: destatis?.target_code ?? null,
          hwo_uid: site.columns.hwo_uid as string | null,
          hwo_provenance: site.columns.hwo_provenance as string | null,
          bundesland: site.columns.bundesland as string | null,
          gemeinde: site.columns.gemeinde as string | null,
          mappings: Object.freeze(mappingsForRecord),
        });
        yield Object.freeze({
          record,
          retained: Object.freeze({
            localSiteId: String(localSiteId),
            hwoConfidence: site.columns.hwo_confidence as number | null,
            createdAt:
              typeof site.columns.created_at === "bigint"
                ? String(site.columns.created_at)
                : null,
          }),
          source: Object.freeze({
            manifestSha256: options.prepared.manifestSha256,
            scope: sourceScope,
            artifact: site.source.artifact,
            siteLocator: site.source.siteLocator,
            mappingLocators: Object.freeze(siteMappings.map((mapping) => mapping.source.mappingLocator)),
          }),
        });
      }
      if (!nextMapping.done) throw new Error("ORPHAN_ASSET_STATE_MAPPING");
    } finally {
      await mappings.return(undefined);
    }
  })();
}
