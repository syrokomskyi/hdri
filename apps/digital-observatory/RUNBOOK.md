# Digital Observatory — Operations Runbook

## Prerequisites

- Node.js 20+, pnpm 10+
- Repo-level `.env` provisioned with DEVICE_ID and DEVICE_SIGNING_KEY
- `pnpm install` run from repo root

---

## One-time setup (per machine)

### 1. Provision device identity

```sh
# From repo root
pnpm setup:device-id            # uses os.hostname() as DEVICE_ID
pnpm setup:device-id my-laptop  # explicit DEVICE_ID
```

This:
- generates an ed25519 key pair
- writes `.env` (DEVICE_ID, DEVICE_SIGNING_KEY base64) — gitignored, never commit
- writes `transparency/keys/<DEVICE_ID>.pem` — committable, used by verifiers

The `signing_key_id` is auto-derived as `<DEVICE_ID>-<sha256(publicKeyPem)[:16]>`.

---

## Per-run workflow

### 2. Configure `.input/brief.md`

Copy from example and edit:

```bash
cp apps/digital-observatory/.input/brief.example.md apps/digital-observatory/.input/brief.md
```

Key settings:

```yaml
---
sourceToken: "2026-Q2-DE"
outputLanguage: de
period: "2026-Q2"
sourceDbDir: "../hdri-factory/0-harvest-source/.output"
publicMode: false
---
```

- `sourceToken` — must match the token used in hdri-factory
- `sourceDbDir` — path to hdri-factory output (parent of all pipeline outputs)

### 3. Run the factory pipeline (sequential)

The hdri-factory pipelines must complete before running observatory:

```sh
# From monorepo root
pnpm turbo run start --filter=@org/catalog-harvest
pnpm turbo run start --filter=@org/site-liveness
pnpm turbo run start --filter=@org/site-profile
pnpm turbo run start --filter=@org/site-lighthouse-audit  # optional
pnpm turbo run start --filter=@org/site-axe-audit          # optional
```

Or use the hdri-factory RUNBOOK for step-by-step instructions:
```
apps/hdri-factory/RUNBOOK.md
```

### 4. Run the observatory

```sh
cd ../../digital-observatory
pnpm start
```

### 5. Verify vault signatures

```sh
pnpm verify:vault                       # current year
pnpm verify:vault -- --year 2026
```

Public keys are auto-discovered from `transparency/keys/*.pem`. Each row's
`signing_key_id` (e.g. `monolith-abc123def456789a`) is matched against the
fingerprint of the loaded keys. Exit code 0 = all signatures valid.

---

## Multi-device collaboration

Two laptops collecting the same `sourceToken` independently:

```
laptop-A: pnpm setup:device-id laptop-A          # DEVICE_ID=laptop-A
laptop-A: cd 0-harvest-source && pnpm start      # writes .output/laptop-A/...
        → rsync .output/laptop-A/ → laptop-B:apps/hdri-factory/0-harvest-source/.output/

laptop-B: pnpm setup:device-id laptop-B          # DEVICE_ID=laptop-B
laptop-B: cd 0-harvest-source && pnpm start      # writes .output/laptop-B/...
laptop-B: cd ../1-register-businesses && pnpm start
            # walks .output/laptop-A/ AND .output/laptop-B/ (Phase B)
```

Ignore a stale device's data:
```sh
mv .output/old-laptop .output/-old-laptop   # leading dash → ignored
```

---

## Key rotation

1. `pnpm setup:device-id <DEVICE_ID> --force`
2. Commit the new `transparency/keys/<DEVICE_ID>.pem`
3. Future runs sign with the new key; old signatures remain verifiable via
   their stored `signing_key_id` matching the OLD key fingerprint — keep the
   old `transparency/keys/<DEVICE_ID>-<fp>.pem` archived if you need to
   re-verify historical data.

---

## Outputs

| Path | Contents |
|------|----------|
| `.output/db/observatory_YYYY.db` | SQLite: observations, scores, asset_id_map, synced_bundles |
| `.output/vault/observations/year=YYYY/*.parquet` | Signed Parquet shards (ZSTD) |
| `.output/mart/site-scores.csv` | Scored sites CSV |
| `.output/mart/cohort-aggregates.json` | Cohort statistics |
| `.output/mart/remediation-report.csv` | Indicator-level recommendations (score < 60) |

### Query the vault with DuckDB

```sql
SELECT asset_id, signal_path, value_bool, observed_at
FROM read_parquet('.output/vault/observations/year=*/*.parquet',
  hive_partitioning=true)
WHERE signal_path = 'legal.impressum.present'
ORDER BY observed_at DESC
LIMIT 100;
```
