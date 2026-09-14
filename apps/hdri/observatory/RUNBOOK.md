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
sourceToken: "2026-q3-de-05"
outputLanguage: de
period: "2026-q3"
capsuleId: "019..." # the same UUID v7 used by every Factory stage
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
# Q3 Lighthouse is disabled by the frozen instrument plan
pnpm turbo run start --filter=@syrokomskyi/site-axe-audit
pnpm turbo run start --filter=@syrokomskyi/contract-ontology
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

After promotion and publication artifacts are complete, Observatory performs the sole final capsule seal. The resulting `capsule-manifest.json` verifies every root-relative artifact and `capsule-signature.json` authenticates that manifest. Factory staging output alone is not a sealed scientific quarter.

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

This writes `transparency/timestamps/<period>/publication.json` and `publication.json.ots`. **Commit both to the public repo** — the proof must travel with the source. `--no-stamp` writes the record offline (anchor later); `--period 2026-Q2` targets a specific period. See [`transparency/timestamps/README.md`](../../../transparency/timestamps/README.md) for how a third party verifies it independently.

### 5. Verify vault signatures

```sh
pnpm verify:vault                       # current year
pnpm verify:vault -- --year 2026
```

Public keys are auto-discovered from `transparency/keys/*.pem`. Each row's
`signing_key_id` is matched against the fingerprint of the loaded keys. The checker
also requires exact SQL/JSON observation-ID agreement. Embedded signing metadata
must contain all four fields and agree with the SQL envelope; it is never silently
overwritten. The result reports such failures as `inconsistent`.

Exit code 0 means no failure among the selected signed, non-NULL-JSON rows. Empty
input also exits successfully; `--limit` checks only a subset. Neither result proves
complete quarterly coverage, agreement of other SQL columns, or recoverability.
Do not use this diagnostic alone to authorize baseline import or evidence eviction.
Historical signatures exclude `signed_at`, `signing_key_id`, `collector_id` and
`signature` from their payload. Matching copies of metadata are not proof of its
historical time/device claims. Archive authentication and externally grounded
provenance remain required; snapshot signing alone does not prove historical truth.

The checker preserves JSON bytes but does not bound SQLite cell allocation. It
opens the working database read-only, which can still touch WAL shared-memory
files. **Do not run this CLI against Q2 originals or retained archive databases.**
The future conversion reader must use only authenticated private standalone copies.

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

## Q2 preservation boundary

The 2026-09-14 correction verifies actual complete copies; A1 is still incomplete.
No operational Q2 run has been performed by these tests. Keep production admission
blocked until baseline conversion, capacity/fault proofs and authenticated physical
custody are complete. Three local fixture directories do not prove three independent
media or custodians. Approval of this qualification machine does not supply those facts.

### Explicit inputs

Prepare a closed JSON inventory outside every source and destination root:

```ts
type PreservationInput = {
  schema: "hdri-preservation-input@1";
  sourceRoots: string[]; // Nonempty, explicit absolute canonical directories.
  entries: Array<{
    absolutePath: string;
    role: string; // Unique relative POSIX file identity, no traversal or prefix collisions.
    access: "internal" | "restricted" | "public";
    sha256: string; // SHA-256 of the actual original bytes, lowercase hex.
    bytes: number;
  }>;
```

Use `inventorySources` from `tools/preservation/inventory.ts` for acquisition after
stopping source writers. It walks all declared roots, including SQLite sidecars;
missing/unreadable roots, symlinks and detected secret markers fail. Roles emitted
by this producer are `source-0000/<relative-path>`, etc., ordered by source root.
Review and retain that input; the CLI compares it to actual files, not substitutes
a new inventory. The 64 MiB input/manifest limit and one-million-source-file cap
are bounds, not a proven capacity profile.

The destinations file is a JSON array of at least three and at most 32 exact
`{ path, failureDomain, medium, credentialBoundary }` objects. Supply real approved
metadata, never invented labels. Paths must be absolute, canonical, fresh
(nonexistent, with existing parents), pairwise disjoint and outside all sources.
Stop other writers and keep all ancestor directories stable. Directory fsync must
be supported; this mechanism is not an OS snapshot or an adversarial-writer sandbox.

### Commands and proof domains

From the repository root, after preparing those explicit inputs:

```sh
pnpm --filter @syrokomskyi/observatory preserve:q2 --inventory /absolute/inventory.json --destinations /absolute/destinations.json --dry-run --json
pnpm --filter @syrokomskyi/observatory preserve:q2 --inventory /absolute/inventory.json --destinations /absolute/destinations.json --json
pnpm --filter @syrokomskyi/observatory preserve:verify --destinations /absolute/destinations.json --manifest-sha256 <retained-manifest-file-sha256> --verification-key /absolute/trusted-public.pem --key-id <trusted-key-id> --json
```

Only the writing command requires explicit `DEVICE_ID` and `DEVICE_SIGNING_KEY`
in its environment; no implicit `.env` is loaded. Dry-run and verification need
no private key. Pin the verification key independently of the copy's bundled PEM.
Retain the expected manifest file digest outside the copies; recomputing it from
an untrusted replacement is not an independent pin.

Each destination contains exact `originals/<role>` bytes, separate
`snapshots/<role>` for SQLite databases, and `content-manifest.json`,
`content-manifest.sig`, `verification-key.pem`, `destination-receipt.json`.
SQLite opens only private scratch copies of the retained DB/WAL/journal; originals
and their SHM bytes are never opened by SQLite. Snapshots use standalone DELETE
journal mode before their final digest is recorded. Original and snapshot digests
are distinct identities. The Ed25519 signature covers the SHA-256 of canonical
manifest JSON; the external pin hashes exact stored manifest bytes. A receipt
counts the complete artifact set at one destination, never individual files as
independent replicas. It is consistency metadata, not a signed custodian statement.

Verification always reads every file, checks the exact listed set, hashes, sizes,
signature, external key and destination receipt. Unexpected files and symlinks
fail. Keep diagnostic logs outside the closure. Copy/read-back is O(total bytes)
with several passes, O(file count) inventory memory and bounded streaming buffers;
it is not the 200k qualification run.

`planned` with zero exit means read-only validation only. `pass` with zero exit
means all declared copies passed byte/signature checks, not operational admission.
Errors/interruptions can leave partial output; never delete originals or overwrite
an attempted destination to retry. Keep partial roots and select new destinations.
The `baseline:import` CLI currently fails before I/O with
`BASELINE_CONVERSION_UNVERIFIED`; do not bypass it using internal converter helpers.
Follow the [A1 correction sequence](../../../docs/plans/plan-rfc-0115-require-executable-hdri-release-and-recovery-proofs.md).

### Baseline comparison building blocks (A1 partial)

Code checkpoint `947b5f9` adds structural identity validation and a bounded exact
record comparison kernel. It does **not** replace the blocked conversion command.

- Identity input has exactly `producer`, `device`, `databaseSha256`, `localSiteId`,
  `provisionalId`, `canonicalId`, `evidenceRefs`. Keep producer/device provenance
  explicit; do not derive it from a convenient directory name. Evidence refs must
  be unique safe relative object paths; this parser does not prove their existence.
- Scope local IDs by the complete producer/device/database generation. UUIDs are
  retained byte-for-byte. Duplicate scoped rows and conflicting provisional aliases
  fail, including duplicates with the same UUID. Known aliases in different scopes
  can refer to the same canonical UUID. Empty resolution does not count as import.
- `validateBaselineImportReceipt` validates a closed shape, lowercase SHA-256 text
  and nonnegative safe-integer reference counts. It does not authenticate the receipt
  or assert that a positive unresolved count is acceptable for admission.
- `compareBaselineRecords` consumes separate source/target iterators with the same
  explicitly ordered field list. Project all required fields independently from
  verified source and closed/reopened target; do not reuse the writer's output as
  expected data. Streams need unique keys ordered by UTF-8 bytes. Use SQLite
  `safeIntegers()` to avoid rounding 64-bit integers before comparison.
- Equality preserves typed NULL/bool/number/integer/text/blob values, timestamps,
  statuses, evidence refs and keys without normalization. JSON text is byte-exact;
  explained format transformations belong to the audited projection contract, not
  an implicit equivalence rule. Empty domains return `empty`, never `equal`.
- The kernel retains a row pair, at most 100 sampled differences and fixed per-field
  counters. Limits are 256 fields, 4 KiB keys, 8 MiB encoded records and 100 million
  rows per side. These defensive caps are not a measured capacity qualification.
  I/O readers must bound cells before allocation and prove complete domain coverage;
  the kernel cannot detect a caller that silently supplies only a matching subset.
- Projection hashes bind domain, field order, typed values and keys. They are not
  hashes of final SQLite/CAS files. Final-file hashing after DB close, authenticated
  runtime/schema dependency closure and receipt creation are still pending.

The WAL integration fixture uses the actual preservation coordinator and verified
input preparation to obtain a private standalone snapshot; it verifies all replica
bytes again after comparison. A first
direct-source SELECT fixture changed SHM; the retained assertion was kept and the
fixture now follows the safe snapshot path. Real Q2 sources were inspected only
through `sqlite3` immutable read-only URI access for schema/aggregate diagnostics
after checking that the inspected WAL files were empty; they were not converted.
Immutable mode ignores WAL and must not be used to read uncheckpointed raw evidence.

### Verified baseline input preparation (A1 partial)

Code checkpoint `ac6a4e2` adds `prepareBaselineSource` to the existing preservation
owner. It accepts `destinations`, `manifestSha256`, `verificationKeys`, an exact
`sourceDestinationPath` selecting one declared copy, and a new absolute `workRoot`.
There is no CLI command for this intermediate step; `baseline:import` stays blocked.

The function verifies signatures, receipts and every object in all declared copies
before creating work files. Trust comes from the externally supplied digest/key,
never the bundled key or a caller-supplied manifest. Caller-owned metadata is
detached before asynchronous work. The existing current `source-NNNN/<relative>`
inventory layout identifies original roots solely to prevent filesystem overlap;
it does not establish producer/device attribution. Unknown/inconsistent layouts
fail before working output. Recorded original paths are not opened or required to
exist, but the work root must be disjoint from them and every replica.

It copies all listed artifacts with exclusive creation, held bounded reads,
digest/size verification and file/directory synchronization, then checks the exact
working file set and independently hashes every copied object. Each SQLite original
must have a snapshot with SQLite magic and rollback-format read/write header bytes.
A correctly signed archive with a missing snapshot, WAL main file or non-SQLite
snapshot still fails. This is not SQLite integrity checking or schema recognition:
the converter must perform those on the private snapshots before domain decoding.

The result contains only the work root, pinned manifest digest and deeply frozen
manifest metadata. It creates no receipt, resume checkpoint or second baseline
format. Work contains artifact paths only (`originals/`, `snapshots/` as applicable),
not copied destination attestations. Never treat its structural TypeScript type as
admission authority. Maintain writer exclusion and stable ancestors throughout
consumption; immutable metadata does not make the filesystem immutable. Only open
copied snapshots with SQLite; retained originals remain byte evidence.

Completed preparation objects are now registered in a private process-local
WeakSet. `assertPreparedBaselineSource` accepts only that exact object, after the
final checks and directory sync. Copying/freezing/deserializing its fields does not
reconstruct verified acquisition. This protects internal consumers from accidental
metadata forgery, not from malicious code in the same process, and does not assert
that files remain unchanged or that a quarter is admitted.

Cost: one complete read of every declared replica plus a copy, copy read-back and
final read-back of the selected artifact closure. Working disk needs the entire
artifact closure, not just DB snapshots; no table or whole artifact is buffered.
Metadata inherits the preservation limits (64 MiB manifest, bounded object count).
Capacity/inode preflight, enforced writer exclusion and process-death/fsync proofs
remain required by A1 step 6. The new injected disk-full/sync tests demonstrate
error propagation, not real crash durability. Failed working roots remain for
diagnosis and cannot be resumed or overwritten; retry with a new root.

### Bounded observation source reader (A1 partial)

`streamPreparedObservations(prepared, snapshotUri)` in
`tools/preservation/observation-source.ts` accepts the exact live preparation object
and a single declared `sqlite-snapshot`. No CLI, metadata hydration or resume bypass
is added. It checks digest/size, standalone rollback header and absent WAL/SHM/journal
before SQLite access. It uses the existing safe file owner, closes SQLite on normal
exhaustion, early return and decoding failure, then hashes the complete file again.
Symlinks and changed bytes fail; original DB/WAL paths are never selected.

The recognized source is the 25-column `observations` table from Observatory
migrations 1–3: exact column order, declared types, nullability, primary key and
non-generated columns. Views, additional/missing/generated columns, non-UTF-8
storage and non-BINARY primary-key ordering fail. SQL is fixed by this source
contract, never copied from retained DDL. Other tables and source producer/device
attribution are not certified by recognizing this table.

The reader uses SQLite `octet_length(column)` and lazy `CASE` to cap aggregate row
content at 8 MiB and ID bytes at 4 KiB **before driver transfer**. Oversized or
wrong-storage-class rows return only an invalid sentinel and NULL fields; they
stop the stream, not disappear from it. No OFFSET paging or full-table JS array is
used. The BINARY primary-key index supplies order without a domain-sized temporary
sort; a 100-million-row ceiling is defensive, not capacity qualification. SQLite
3.53.4 on this machine supports the required functions. See the primary references
for [byte-length metadata](https://www.sqlite.org/lang_corefunc.html#octet_length)
and [lazy CASE evaluation](https://www.sqlite.org/lang_expr.html#the_case_expression).

Text arrives as bounded bytes and is decoded with fatal UTF-8 checking, preserving
leading BOM characters inside cells, Unicode and embedded NUL. The original JSON
string is never reserialized; its exact SHA-256 is returned with the frozen SQL
columns and flat parsed payload. Duplicate top-level JSON keys, including escaped
aliases, unknown/nested fields and nonfinite parsed numbers fail. Every mirrored
SQL value, identity, timestamp, lifecycle/collection status and evidence ref must
agree exactly. Absent optional collection status means NULL; boolean storage is
only NULL/0/1. Signing-envelope agreement reuses the signature checker owner.

This is a **source record**, not a semantically validated Observation, a verified
signature, authenticated evidence descriptor or target record. Unmirrored run,
ontology and factory metadata remain intact for later provenance joins; no assumed
mapping to crawl/ruleset fields is made. UUID validity, value/ontology semantics,
measurement quality, producer/device attribution and source/CAS locator resolution
remain mandatory before materialization. Missing JSON and unsupported records stop
this reader while the complete original artifact remains preserved; the complete
converter still needs explicit incomplete-record reconciliation. No record is
silently discarded or assigned an invented timestamp.

Each invocation costs two full file hashes plus one indexed row scan and a bounded
JSON duplicate-key check per row. Rows can be yielded before final file hashing;
only complete exhaustion checks the whole domain. Empty input yields no records and
does not establish nonempty-domain success. The transfer cap is not an OS/native
SQLite heap cap: schema loading, malicious database handling, resource isolation,
capacity/inodes and enforced writer exclusion remain the operational envelope.
The 10,000-record WAL/copy/decoder fixtures are tests, not real Q2 conversion or
200,000-site qualification. Full import remains blocked.

---

## Qualification harness (RFC-0111)

The current `quarter:rehearse` controller is executable offline infrastructure,
not production-path qualification. Every run manifest says
`operationallyQualified: false`. No signed qualification receipt is produced.
Actual production adapters, operation-level fault barriers and complete resource/
runtime evidence are still required by RFC-0115.

### Profile and isolation

A profile is closed JSON with schema `hdri-rehearsal-profile@1`, absolute canonical
`runtimeRoot` and `fixtureRoot`, ordered `stages`, `comparisonFiles` and positive
`stageTimeoutMs` (at most 12 hours). The thirteen stage names come from
`QUALIFICATION_STAGES` in observatory-emit. Each stage declares relative
`producer` and `verifier` JavaScript entry points under runtimeRoot, plus unique
nonempty `outputs` paths under `work/`. Comparison files must be declared outputs.

The controller launches each adapter in Linux bubblewrap with no host network,
read-only runtime/fixture mounts and only stage work scratch writable. Inherited
credentials are absent. A separate verifier must return matching
`hdri-stage-verification@1` output hashes and input identity. Zero exit alone fails.
See `run/tests/rehearsal-controller.test.ts` for mechanism fixtures; these are not
substitutes for the production adapters.

This [machine profile](../../../docs/rfcs/verification/rfc-0115-approved-local-runner-2026-09-13.json)
records operator approval and observed hardware, not runnable adapters or a reserved
resource budget. Unsupported OS isolation blocks execution; never fall back to
unisolated execution or relax global host security policy.

### Fresh, interrupted and resumed runs

After preparing actual runtime and fixture closures:

```sh
pnpm --filter @syrokomskyi/observatory quarter:rehearse --profile /absolute/profile.json --targets 1000 --evidence-root /absolute/new-clean-root --json
pnpm --filter @syrokomskyi/observatory quarter:rehearse --profile /absolute/profile.json --targets 1000 --evidence-root /absolute/new-resume-root --interrupt-after-stage extraction --json
pnpm --filter @syrokomskyi/observatory quarter:rehearse --profile /absolute/profile.json --targets 1000 --evidence-root /absolute/new-resume-root --resume /absolute/new-resume-root/run-manifest.json --compare /absolute/new-clean-root/run-manifest.json --json
```

Fresh roots must be empty/new; resume must point to that root's own manifest.
Keep `run-manifest.json`, `receipts/`, `work/` and the SQLite lock together.
Input/runtime/fixture identity, retained receipts, measurements and output hashes
are checked before reuse. Comparison checks actual files in both runs. A changed
source, missing output, false verifier or conflicting run fails closed.

`--interrupt-after-stage` exercises controller recovery only. It does not inject
a crash at CAS, event transaction, selected-result publication, extraction,
scientific report, replica or public-pointer boundaries.

### Qualification still required

CI now selects every collector and the shared authority/process boundaries.
The small controller tests are not the required 1k whole-chain CI fixture.
There is no verified scheduled 10k run or completed 50k/200k qualification.
Before scale-up, close the [ordered corrective plan](../../../docs/plans/plan-rfc-0115-require-executable-hdri-release-and-recovery-proofs.md),
retain measured disk/inode peaks and whole-tree RSS, freeze complete runtime
identity, execute the actual fault schedule and independently verify signed proof.
Limits remain 2 GiB coordinator RSS, 12 GiB whole-tree RSS, four browser slots and
12 hours. Store lasting run evidence on durable storage, never only in `/tmp`.

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
