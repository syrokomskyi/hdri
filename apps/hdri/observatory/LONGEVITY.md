# Digital Observatory — Longevity & Durability

This document states the two load-bearing invariants that let the Observatory outlive any single machine, operator, or working database, and maps the concrete mechanisms that enforce them. It ends with a **disaster-recovery runbook that is executed as a test** on every PR, so the recovery procedure cannot silently rot.

> The Observatory is a longitudinal instrument. Its value is not this quarter's numbers — it is the ability, years from now, to reproduce and trust every number we ever published. That requires the ground truth to survive things the working database will not.

---

## Principle 1 — The vault is the source of truth

The signed Parquet **vault** (`.output/vault/`) is the canonical, recoverable ground truth. The SQLite database (`observatory_YYYY.db`) is a **derived, disposable working copy** — an index for scoring, validation, and dashboard export.

- Every observation is **ed25519-signed** at the row level and written to an append-only, immutable Parquet shard (one shard per factory run). See `SignObservationsGogol` → `WriteVaultGogol`.
- Asset-state snapshots are stored **self-contained** in the vault (asset metadata + HWO mappings + period), so a whole quarter can be rebuilt from the vault alone, with no access to the original factory emit-bundle (WP7).
- The working DB can always be **rebuilt from the vault** and re-scored under the frozen codebook to reproduce every `overall_score` and `computation_hash` identically (`pnpm run rebuild:vault`, proven by the round-trip test).

**Corollary:** if the vault and the DB ever disagree, the vault wins. The DB is regenerated from the vault, never the other way around.

## Principle 2 — Published is immutable, forever

Once a run is **`published`**, its observations, scores, and vault shards are never rewritten. There is no in-place edit of published data, ever.

- Corrections are **additive**: a mistake is fixed by recording _new_ observations (the old ones transition `active → superseded`, they are not deleted) and, when a methodology changes, by publishing a _new_ run that **supersedes** the prior one for that period. History is preserved; it is never overwritten.
- Schema migrations on the `observations` table are **ADD COLUMN only** — historical rows survive byte-for-byte (enforced by the migrations test, WP9).
- Asset states are **SCD-2**: a new state closes the prior one (`valid_to` set), it does not mutate it.
- Publication is a **separate, gated, reversible** step (`promote-to-canonical`, WP8): a candidate is validated in staging and only an atomic, backed-up swap makes it canonical. The pre-swap canonical DB is always backed up first.

Immutability is what makes cross-quarter comparisons legitimate: a Q2 number you read today is the same Q2 number a reader saw a year ago.

---

## Durability layers

Each layer answers a different failure mode. Together they make data loss require several independent failures at once.

| Layer | Mechanism | Failure it defends against | Where |
| --- | --- | --- | --- |
| Row integrity / authenticity | ed25519 per-observation signatures | tampering, forged rows | `verify:vault` |
| **Immutability, third-party-provable** | **OpenTimestamps anchor of `sha256(vault-manifest + methodology-index)` → Bitcoin** | **the key holder silently rewriting published history** | **`timestamp:publication` (finding 2)** |
| Ground-truth storage | append-only signed Parquet shards | working-DB loss/corruption | `WriteVaultGogol` |
| **Shard completeness** | **vault shard manifest (size + sha256)** | **a missing OR corrupted shard** | **`verify:shards` (WP10)** |
| Point-in-time archive | checksummed snapshot (DB + vault + inputs + keys) | machine loss; off-site 3-2-1 | `snapshot:create` / `snapshot:verify` (WP6) |
| Schema evolution | versioned, additive, ledgered migrations + pre-migration backup | schema change losing rows | `migrate` (WP9) |
| Recoverability | rebuild-from-vault + re-score under frozen codebook | total DB loss; reproducibility audit | `rebuild:vault` (WP7) |
| Publication safety | staging → validate gate → atomic backed-up swap | publishing a broken/duplicate run | `promote` (WP8) |
| Methodology provenance | frozen codebook/ontology/scorer version + content hashes per published run | "which methodology produced this?" | `run_methodology` (WP12) |
| Methodology content | content-addressed per-period snapshot of the exact codebook + ontology + frame, hash-verified | "reproduce a past period's numbers years later" | `snapshot:methodology` (WP15) |
| Methodology evolution | period-ordered changelog flagging every comparability break | "what changed between quarters, and is it comparable?" | `methodology:changelog` (WP15) |
| Business history | append-only lifecycle events (founded/renamed/merged/split/closed) | "what happened to this business over time?" | `asset_lifecycle_events` + vault stream (WP13) |
| Working-store size | hot/cold `obs_json` tiering — evict the vaulted payload from SQLite, recover from the vault | unbounded DB growth across many quarters | `tier:obs-json` (WP14) |

---

## Storage tiering — the working DB stays small forever

The `observations.obs_json` column holds the full canonical JSON of each observation. It exists in SQLite only as a **staging copy** to feed signing and the vault writer — scoring, dashboards, and every query read the typed `value_*` columns, never `obs_json`. Once a factory run's shard is in the vault it is the biggest thing in the DB and pure redundancy.

**Cold-tiering (`tier:obs-json`, WP14)** reclaims it. For each _cold_ factory run it proves the run is recoverable, then NULLs its `obs_json`:

- **Cold policy (conservative default):** a period is evictable only if it is strictly older than BOTH the published baseline (`2026-q2`) AND the latest period present in the DB. So the baseline and the current quarter always stay fully hot. `--include-q2` opts the baseline in; `--before P` tightens further; `--baseline P` moves the protected baseline.
- **Recoverability gate (cannot be bypassed):** a run's `obs_json` is evicted only when (1) its observations shard is recorded in the vault manifest, (2) that shard is present and its bytes+sha256 still match the manifest, and (3) **every** DB observation id for the run is present in the vault shard. Any gap → the run is BLOCKED, never touched.
- **Order of operations:** run `verify:shards` (integrity) and `verify:vault` (signatures) first — eviction assumes signatures already verified; the tool checks integrity + id coverage itself.
- **Dry-run by default:** reports reclaimable bytes and the gate result per run; `--apply` evicts, `--vacuum` compacts the file afterwards.
- **Only `obs_json` is tiered** — the `signature`/`signed_at`/`signing_key_id`/`collector_id` columns stay, so a cold row keeps its authenticity metadata in the DB.

**Rehydration (`tier:obs-json:rehydrate`)** is the reverse path: it reconstructs `obs_json` from the vault via DuckDB — the SAME normalize + serialize that `rebuild:vault` uses, so the recovered copy re-verifies its signature and re-scores identically — and writes it back onto rows where it is NULL. A cold quarter can always be made hot again with no loss.

**Corollary:** the working DB's size is bounded by the hot window (baseline + recent quarters), not by all history. Old quarters cost only their vault bytes, and remain fully recoverable.

---

## Business lifecycle & history

A stable `asset_id` answers "is this the same business as last quarter?". Lifecycle events answer "what has _happened_ to it?" — its coherent story over time.

- **Model** ([`@syrokomskyi/observatory-core/lifecycle`](../../packages/observatory/observatory-core/src/lifecycle.ts)): `founded`, `renamed`, `merged`, `split`, `closed`, `reopened`, `reassigned`. `reconstructAssetHistory` folds an asset's events into a timeline (founded/closed dates, current status, domain/rename chain, merge & split links).
- **Append-only, immutable ground truth**, like observations and the identity registry: events are only ever appended (a correction is a new event), persisted to the durable `asset_lifecycle` vault stream and mirrored to the `asset_lifecycle_events` DB table for queries and joins.
- **Producers (integration hooks):** the dead-domain state machine emits `closed` / `reopened` transitions (never per-ping no-ops); the manual-correction workflow emits `renamed` / `merged` / `split` / `reassigned` when an operator confirms a rebrand, consolidation, or domain hand-over.

---

## Methodology provenance, snapshots & changelog

A longitudinal instrument is only trustworthy if you can say precisely _how_ each period's numbers were produced and whether two periods are comparable.

- **Frozen fingerprint (WP12):** each run records its `methodology_hash` — a stable hash over the codebook + ontology + scorer versions AND their content hashes. Two runs share it only if they scored under byte-identical methodology; that is the exact condition for comparable score deltas.
- **Frozen content (WP15):** `snapshot:methodology` freezes the _actual bytes_ of the codebook, ontology, and population-frame into a content-addressed store (`.output/vault/methodology/`), refusing to freeze any input whose hash does not match `run_methodology`. Content-addressing means a codebook unchanged across quarters is stored once; `--verify` re-hashes every blob. The population-frame — a methodology input for the published post-stratified numbers — is now hashed into `run_methodology.frame_sha256` too, though deliberately kept OUT of `methodology_hash` (the frame reweights headline numbers, it does not re-score, so it is not a comparability break).
- **Changelog (WP15):** `methodology:changelog` reads the published `run_methodology` records and emits a period-ordered `METHODOLOGY-CHANGELOG.md` + `.json` stating what changed between periods (version bumps, same-version content changes, frame changes) and flagging every **comparability break** (a `methodology_hash` change) — the human- and machine-readable companion to the frozen snapshots.

Run both at publish time (see `RUNBOOK.md` → promote). Together they make the DR runbook's "frozen inputs" prerequisite a real, verifiable artifact rather than an assumption about `.input/`.

---

## Disaster-recovery runbook

These procedures are encoded and asserted in [`run/tests/dr-runbook.test.ts`](run/tests/dr-runbook.test.ts). The steps below and the test are kept in lockstep — if the procedure changes, the test changes with it. That is what makes this a **tested** runbook rather than aspirational prose.

### Prerequisites for recovery

You need, on durable/off-machine storage (the 3-2-1 snapshot):

1. The **vault** (`.output/vault/observations/**` + `asset_states/**`) and its `vault-manifest.json`.
2. The **frozen methodology snapshot** for the period(s): the content-addressed `codebook.yaml`
   - `ontology.yaml` + `population-frame.json` under `.output/vault/methodology/`, recorded in `methodology-index.json` and hash-verifiable (`snapshot:methodology --verify`, WP15). This is the concrete artifact behind "the frozen inputs for the period" — it lets you re-score an old quarter with the EXACT codebook that produced it, not whatever currently sits in `.input/`.
3. The **public keys** (`transparency/keys/*.pem`) to re-verify signatures.

### Drill 0 — Verify the vault is intact (do this first, always)

```sh
pnpm run verify:shards          # every recorded shard present + hash-matched (WP10)
pnpm run verify:vault           # every signed observation's ed25519 signature valid
```

`verify:shards` is the check that catches a **missing** shard, not only a corrupted one. If it reports MISSING or CORRUPTED, restore that shard from the latest good snapshot before proceeding.

### Drill 1 — Working DB lost or corrupted

The DB is disposable. Rebuild it from the vault and re-score with the frozen codebook:

```sh
pnpm run rebuild:vault -- --year 2026 \
  --target-db .output/db/observatory_rebuilt_2026.db
```

To _prove_ the rebuild reproduced the published numbers, compare computation hashes against a known-good DB (or a snapshot's DB):

```sh
pnpm run rebuild:vault -- --year 2026 \
  --target-db .output/db/observatory_rebuilt_2026.db \
  --compare <good-db>.db --source-run-id <published-run-id>
```

A faithful vault reproduces every asset's `overall_score` and `computation_hash` identically; `--compare` exits non-zero on any mismatch. The rebuild never writes the canonical `observatory_YYYY.db`. Once verified, promote the rebuilt DB into place by copying it to `.output/db/observatory_YYYY.db`.

### Drill 2 — A shard is corrupted

`verify:shards` reports it under CORRUPTED (bytes/sha256 drift). Restore the shard file from the latest snapshot whose `snapshot:verify` passes, then re-run `verify:shards` and `verify:vault`.

### Drill 3 — A shard is missing

`verify:shards` reports it under MISSING. This is the case that used to be invisible. Restore the shard from a snapshot, or — if it is unrecoverable — the affected factory run's observations are lost and any run that depended on them must be re-published from re-collected data (published history for _other_ runs is untouched).

### Drill 4 — Whole machine lost

Provision a new machine (`RUNBOOK.md` → one-time setup), copy the latest snapshot, run `snapshot:verify` on it, then follow Drill 1 to rebuild the DB from the snapshot's vault. Signatures remain verifiable via the archived public keys.

---

## Offsite replication & scheduled verification

The vault is the source of truth, so a single disk holding it is the single point of failure. Two habits make "the machine is gone" a recoverable event rather than a catastrophe:

- **Replicate offsite.** `pnpm run replicate:vault -- --dest <offsite>` mirrors the manifest-recorded shards + `vault-manifest.json` + the methodology snapshot store to a second location — a mounted external disk, an rclone/s3fs mount of an object store (R2/S3), or another machine. It is dry-run by default, idempotent (copies only new/changed shards by sha256, never deletes), and **verifies the replica against the manifest after copying**. Run it after every quarter's publication, to at least two independent destinations.
- **Verify on a schedule.** Silent bit-rot is caught only if you look. Schedule `pnpm run verify:shards` (manifest planned-verification: MISSING + CORRUPTED) on both the primary and each replica — e.g. weekly via cron/Task Scheduler — and alert on a non-zero exit. Pair with `pnpm run verify:vault` (ed25519 signatures + the trusted-keys policy) at least each quarter.

A replica that passes `verify:shards` is a full, restorable copy of the source of truth: Drill 4 ("whole machine lost") becomes "point `--vault-dir` at the replica and rebuild".

---

## What must never happen

- **Never** edit a published observation, score, or shard in place. Correct forward. This is now enforced mechanically at the write boundary: `VaultWriter` **refuses to overwrite** an existing shard and marks every shard it writes **read-only** (`chmod 0o444`), so an accidental edit by an operator or a weaker agent fails at the filesystem instead of silently mutating ground truth. A determined tamperer can still restore write permission — that is what the manifest sha256 and ed25519 signatures catch; read-only defends against the _accident_, the hash against the _tamper_.
- **Never** treat the SQLite DB as the source of truth. It is an index; the vault is truth.
- **Never** delete a vault shard. Shards are immutable and manifest-tracked; deletion is detected by `verify:shards` and breaks recoverability.
- **Never** promote without the validate gate passing (WP8).
