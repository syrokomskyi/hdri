---
title: Write Vault
factory: write-vault
summary: >
  Exports signed observations from the observatory DB to the vault as ZSTD Parquet
  shards, one shard per factory run_id. Idempotent — existing shards are skipped.
  The vault is the canonical long-term store consumed by analytics and transparency
  tooling.
decisionType: auto
artifacts:
  - id: vault-write-report
    format: json
    description: JSON report listing shard paths, observation counts, and skipped shards
---

# Write Vault

Reads signed observations (signature IS NOT NULL) for each factory run synced in
this observatory run, then writes one ZSTD Parquet shard per factory run to the
vault at `brief.vaultDir` (defaults to `.output/vault/`).

Layout:
```
<vaultDir>/observations/year=YYYY/{factory_run_id}.parquet
```

Hive-partitioned by year — DuckDB can read all shards with:
```sql
SELECT * FROM read_parquet('<vaultDir>/observations/year=*/*.parquet',
  hive_partitioning=true)
```

Unsigned observations (not yet processed by sign-observations) are skipped.
