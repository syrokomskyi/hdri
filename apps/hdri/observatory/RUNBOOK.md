# Digital Observatory — Operations Runbook

## Prerequisites

- Node.js 22 (see `.nvmrc` / root `engines`; CI builds and re-proves reproducibility on 22), pnpm 10+
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
- writes `apps/hdri/.env` (DEVICE_ID, DEVICE_SIGNING_KEY base64) — gitignored, never commit
- writes `transparency/keys/<DEVICE_ID>.pem` — committable, used by verifiers

The `signing_key_id` is auto-derived as `<DEVICE_ID>-<sha256(publicKeyPem)[:16]>`.

---

## Per-run workflow

### 2. Configure `.input/brief.md`

Copy from example and edit:

```bash
cp apps/hdri/observatory/.input/brief.example.md apps/hdri/observatory/.input/brief.md
```

Key settings:

```yaml
---
sourceToken: "2026-Q2-DE"
outputLanguage: de
period: "2026-Q2"
sourceDbDir: "../factory/0-harvest-source/.output"
publicMode: false
---
```

- `sourceToken` — must match the token used in factory
- `sourceDbDir` — path to factory output (parent of all pipeline outputs)

### 3. Run the factory pipeline (sequential)

The factory pipelines must complete before running observatory:

```sh
# From monorepo root
pnpm turbo run start --filter=@syrokomskyi/catalog-harvest
pnpm turbo run start --filter=@syrokomskyi/site-liveness
pnpm turbo run start --filter=@syrokomskyi/site-profile
pnpm turbo run start --filter=@syrokomskyi/site-lighthouse-audit  # optional
pnpm turbo run start --filter=@syrokomskyi/site-axe-audit          # optional
```

Or use the factory RUNBOOK for step-by-step instructions:

```
apps/hdri/factory/RUNBOOK.md
```

### 4. Run the observatory (writes to STAGING, never canonical)

```sh
cd ../../observatory
pnpm start
```

A run no longer publishes. It writes the whole quarter into a **staging** DB (`.output/db/staging/observatory_YYYY.db`), seeded as a consistent copy of the current canonical DB so prior quarters are preserved. The finished run is a `candidate` — the dashboard-facing `.output/db/observatory_YYYY.db` is untouched.

### 4a. Gate + promote to canonical (WP8)

Publication is a separate, reversible step gated on `validate` returning **zero errors**. Dry-run first (validates only, touches nothing), then apply:

```sh
pnpm run validate:staging        # inspect staging integrity directly (optional)
pnpm run promote                 # DRY-RUN: validate the candidate as if published
pnpm run promote -- --apply      # promote: mark published + atomically swap canonical
```

`promote`:

1. Selects the finished candidate in staging (`--run-id` / `--period` to pick one, else the newest).
2. Runs the **shared** validate gate on staging with the candidate treated as published (and any prior published run of that period treated as superseded, exactly as promotion will do). **Any ERROR aborts — canonical is untouched.**
3. On `--apply`: marks the candidate published in staging, re-validates, backs up the current canonical DB to `.output/db/backups/observatory_YYYY.db.<ts>.bak`, then atomically swaps staging → canonical via the SQLite backup API.

The gate also runs **data-quality drift checks** across published periods (finding 8): an unexplained score-distribution shift under identical methodology, a collapse in the scored sample size, or a spike in dead-domain share each raise a **blocking ERROR**, because those are the fingerprints of a broken crawl/scoring run rather than a real-world change. If you have investigated and confirmed the shift is genuinely real, acknowledge it and publish with:

```sh
pnpm run promote -- --apply --allow-drift   # downgrades drift ERRORs to WARN (still reported)
```

`--allow-drift` only touches the drift checks — integrity/comparability ERRORs are never downgraded. Prefer to first inspect the drift with `pnpm run validate:staging`.

To roll back a promotion, restore the timestamped backup over `.output/db/observatory_YYYY.db`.

### 4b. Freeze the period's methodology + update the changelog (WP15)

Right after promoting, freeze the exact codebook/ontology/frame that produced the period and regenerate the changelog. Freezing is hash-checked against `run_methodology`, so it refuses if `.input/` has drifted from what scored the run:

```sh
pnpm run snapshot:methodology                      # DRY-RUN: shows what would freeze (hash-checked)
pnpm run snapshot:methodology -- --apply           # freeze codebook+ontology+frame → .output/vault/methodology/
pnpm run snapshot:methodology:verify               # re-hash every stored blob (integrity)
pnpm run methodology:changelog                      # write METHODOLOGY-CHANGELOG.md + .json
```

The snapshot store is content-addressed (an unchanged codebook is stored once across quarters) and per-period immutable (a different methodology for an already-frozen period is refused without `--force`). The changelog flags every **comparability break** — a period whose `methodology_hash` differs from the prior period, across which score deltas are not apples-to-apples.

### 4c. Timestamp the publication (finding 2 — third-party-verifiable immutability)

Signatures prove authorship; a timestamp proves the published bytes existed and were not altered afterward — verifiable by anyone, without trusting us. After 4b, anchor the period's `vault-manifest.json` + `methodology-index.json` with OpenTimestamps (→ Bitcoin):

```sh
pnpm run timestamp:publication                     # build publication.json + stamp its digest → .ots (contacts calendar servers)
# … a few hours later, once the Bitcoin attestation lands:
pnpm run timestamp:publication:upgrade             # embed the confirmed attestation into the .ots
pnpm run timestamp:publication:verify              # re-hash the pinned files + verify the proof
```

This writes `transparency/timestamps/<period>/publication.json` and `publication.json.ots`. **Commit both to the public repo** — the proof must travel with the source. `--no-stamp` writes the record offline (anchor later); `--period 2026-Q2` targets a specific period. See [`transparency/timestamps/README.md`](../../transparency/timestamps/README.md) for how a third party verifies it independently.

### 5. Verify vault signatures

```sh
pnpm verify:vault                       # current year
pnpm verify:vault -- --year 2026
```

Public keys are auto-discovered from `transparency/keys/*.pem`. Each row's `signing_key_id` (e.g. `monolith-abc123def456789a`) is matched against the fingerprint of the loaded keys. Exit code 0 = all signatures valid.

### 6. Rebuild from the vault (disaster recovery)

The vault — not the working DB — is the recoverable source of truth. If `observatory_YYYY.db` is lost or corrupted, reconstruct a fresh DB purely from the signed Parquet shards and re-score it with the frozen codebook:

```sh
pnpm rebuild:vault -- --year 2026 --target-db .output/db/observatory_rebuilt_2026.db
# Optional integrity gate: prove the rebuild reproduces a known DB's computation_hashes
pnpm rebuild:vault -- --year 2026 --target-db .output/db/observatory_rebuilt_2026.db \
  --compare .output/db/observatory_2026.db --source-run-id <published-run-id>
```

The rebuild reads observations and (post-WP7) self-contained asset_states from the vault. For pre-WP7 vaults that never stored asset_states, re-derive them from the factory emit-bundle with `--emit-dir <bundle-dir>`. The re-score runs through the **same** scoring core as the live pipeline, so a faithful vault reproduces every asset's `overall_score` and `computation_hash` identically — `--compare` exits non-zero on any mismatch. It never writes the canonical `observatory_YYYY.db`.

### 7. Reclaim DB size — cold-tier `obs_json` (WP14)

`obs_json` is a disposable staging copy of each observation's signed JSON; once its vault shard is verified it is pure redundancy and the biggest column in the DB. `tier:obs-json` evicts it for **cold** periods (recoverable any time via the vault), keeping the working DB small across years. Verify the vault first — the tool assumes signatures already verified:

```sh
pnpm verify:shards && pnpm verify:vault           # integrity + signatures FIRST
pnpm tier:obs-json                                 # DRY-RUN: reclaimable bytes + gate result per run
pnpm tier:obs-json -- --apply --vacuum            # evict cold obs_json, then compact the file
```

Conservative by default: only periods strictly older than BOTH the published baseline (`2026-q2`) and the latest period are eligible, and a run is evicted only if its shard is present, hash-matches the manifest, and covers every DB observation id (else it is BLOCKED). Flags: `--include-q2` (allow the baseline), `--before <period>` (tighten), `--baseline <period>`, `--year <YYYY>`.

Reverse path — make a cold quarter hot again (reconstructs `obs_json` from the vault):

```sh
pnpm tier:obs-json:rehydrate -- --apply
```

---

## Multi-device collaboration

Two laptops collecting the same `sourceToken` independently:

```
laptop-A: pnpm setup:device-id laptop-A          # DEVICE_ID=laptop-A
laptop-A: cd 0-harvest-source && pnpm start      # writes .output/laptop-A/...
        → rsync .output/laptop-A/ → laptop-B:apps/hdri/factory/0-harvest-source/.output/

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
3. Future runs sign with the new key; old signatures remain verifiable via their stored `signing_key_id` matching the OLD key fingerprint — keep the old `transparency/keys/<DEVICE_ID>-<fp>.pem` archived if you need to re-verify historical data.

---

## Outputs

| Path | Contents |
| --- | --- |
| `.output/db/observatory_YYYY.db` | Canonical SQLite (published): observations, scores, asset_id_map, synced_bundles |
| `.output/db/staging/observatory_YYYY.db` | Staging working copy (candidate run) — promoted to canonical only after the validate gate passes |
| `.output/db/backups/observatory_YYYY.db.<ts>.bak` | Pre-promotion canonical backups (roll back a promotion by restoring one) |
| `.output/vault/observations/year=YYYY/*.parquet` | Signed Parquet shards (ZSTD) |
| `.output/vault/asset_states/year=YYYY/*.parquet` | Self-contained asset-state records + mappings (rebuildable quarter) |
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
