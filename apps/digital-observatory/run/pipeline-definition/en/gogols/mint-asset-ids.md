---
title: Mint Asset IDs
factory: mint-asset-ids
summary: >
  Resolves provisional da_* asset IDs (deterministic SHA-256 hash) to canonical
  UUIDv7 asset IDs and stores the mapping in the observatory DB. Idempotent —
  already-mapped IDs are skipped.
decisionType: auto
artifacts:
  - id: mint-report
    format: json
    description: JSON report with count of newly minted IDs and already-mapped IDs
---

# Mint Asset IDs

Factory gogols use `deriveAssetId(domain)` — a deterministic `da_*` hash — as
a provisional asset identity. The observatory mints stable UUIDv7 IDs the first
time each provisional ID is seen, storing the mapping in `asset_id_map`.

Existing observation and asset_state records are never rewritten (that would
break ed25519 signatures). The map table is the join key for analytics that
need canonical UUIDv7 IDs.
