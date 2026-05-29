# 1-register-businesses

Multi-device business deduplication and provisional asset-id minting.

**Status: Phase A scaffold — full implementation lands in Phase B.**

## What it does (Phase B target)

1. Walks every sibling `0-harvest-source/.output/<deviceId>/data/db/core_<sourceToken>.db`
   except devices whose folder name starts with `-` (ignored).
2. Reads all distinct domains from the discovered `core_*.db` files.
3. Normalises domain to eTLD+1 (rules from `architecture_asset_identity.md`).
4. Mints `da-<uuid>` provisional asset_id via `deriveAssetId(domain)`.
5. Writes the merged registry to:
   `.output/<DEVICE_ID>/data/db/registry_<sourceToken>.db`

   Tables:
   - `business_registry(da_id, domain, first_seen_source_token, first_seen_device_id, first_seen_at)`
   - `registry_alias(da_id, alternate_domain, source_token)`

6. Final gogol: `<N>-sign-source` produces a per-source ed25519 signature manifest
   covering the registry tables (Phase B).

## brief.md

Local app-level `brief.md` (kept minimal):

```yaml
skipGogols: []
```

`sourceToken` is read from the **shared factory-level** `hdri-factory/.input/brief.md`.
No upstream paths needed — register-businesses scans all sibling `0-harvest-source/.output/*/`
folders except those starting with `-`.

## Why this app exists

Without this layer, every downstream factory app (check-liveness, extract-profile,
audit-*) would have to discover sibling devices independently, duplicating logic.
Centralising dedup here means downstream apps simply read `registry_<sourceToken>.db`
and never see the multi-device complexity.

See the root README for the overall factory pipeline order and prerequisites.
