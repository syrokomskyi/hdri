# HDRI-Factory Operator Runbook

Operational guide for running the HDRI (Handwerk Digital Readiness Index) factory pipeline chain.

## Current readiness — integration review, 2026-09-13

Expanded live collection and publication remain blocked. The cross-session review found disconnected execution, capture, translation and release mechanisms despite implemented RFC statuses. Treat the architecture sections below as required contracts, not proof of operational readiness. Read the [review and remaining findings](../../../docs/reviews/code/apps-hdri/review-2026-09-12-23-55-apps-hdri.md) and the [corrective sequence](../../../docs/rfcs/rfc-0113-bind-hdri-admission-to-verified-quarter-evidence.md). The corrective RFCs are drafts, not authorization to run or publish.

Entry points use fixed collect/publish operations; environment flags do not turn them into diagnostics. Direct release, promotion apply and dashboard exports also block before filesystem effects while verified receipt loading is absent. Use separate read-only diagnostics. Do not replace null references with invented digests or treat the current readiness text files as verified authority.

Independent rebuild currently fails with REBUILD_EXECUTOR_UNAVAILABLE before any filesystem effect. The empty-directory placeholder was removed; no replacement executor or operational restore proof is claimed. Original Q2 and prior quarter data must remain untouched.

## Pipeline Overview

The factory consists of 6 sequential pipelines:

```
0-harvest-source → 1-register-businesses → 2-check-liveness → 3-extract-profile → 4-audit-lighthouse → 5-audit-axe
     ↓                     ↓                      ↓                    ↓                    ↓                    ↓
  core_YYYY.db       registry_YYYY.db       liveness-YYYY-qN.db pages-YYYY-qN.db lighthouse-YYYY-qN.db   axe-YYYY-qN.db
```

Each pipeline depends on the previous one. **Always run in order.**

---

## Pre-Flight Checklist

Before starting any pipeline:

- [ ] Upstream pipeline completed (if not first)
- [ ] `.input/brief.md` created from `brief.example.md`
- [ ] `sourceToken` uses correct format: `YYYY-Qn-CC[-extra]`
- [ ] One UUID v7 `capsuleId` has been minted for the quarter and copied unchanged into every Factory and Observatory brief (uniqueness against prior quarters is checked automatically)
- [ ] The new quarter batch directory contains only newly received source files; prior batch directories and all prior `.output` data are unchanged
- [ ] Input data files in correct locations
- [ ] Sufficient disk space (estimate 1GB per 1000 sites)
- [ ] Chrome/Chromium installed (for audit pipelines)

---

## Program Gate (RFC-0099)

Every factory and observatory entry point calls `evaluateProgramGate()` from `@syrokomskyi/factory-core` before starting the pipeline engine. The gate is **fail-closed**: if prerequisite evidence is missing, the run is blocked with a diagnostic error listing the missing evidence refs.

### Operations

- **collect** (factory apps): Requires preservation receipt and collection readiness evidence. Without them, live data-mutating runs are blocked.
- **publish** (observatory): Requires preservation, collection, and publication readiness evidence. A collection receipt alone does not authorize publication.
- **diagnostic**: Separate read-only diagnostic commands remain available without collection/publication readiness. Mutating pipelines cannot be relabelled as diagnostics.

### Bootstrap state

All live entry-point evidence refs remain `null`; verified receipt loading is not wired. Collection and publication stay blocked until the corrective sequence supplies real scoped proof. The earlier implemented document statuses do not fill these references.

### Blocker codes

When blocked, the gate reports stable codes: `MISSING_PRESERVATION_RECEIPT`, `MISSING_COLLECTION_READINESS`, `MISSING_PUBLICATION_READINESS`, `MISSING_PERIOD`. Each code names the specific missing evidence, allowing targeted remediation rather than blanket suppression.

---

## Chain of Trust (Signature Verification)

Every pipeline in the factory chain cryptographically seals its primary output before the next pipeline is allowed to consume it.

### How it works

1. **Signing:** The final gogol in each pipeline (`SignSourceGogol`) computes a SHA-256 hash of the primary artifact (e.g. `core.db` or `registry_YYYY.db`), creates an ed25519 signature, and writes a `source-signature.json` manifest containing:
   - `app_id` — the pipeline that produced the data (e.g. `0-harvest-source`)
   - `content_hash` — the canonical SHA-256 of the artifact
   - `signing_key_id` — `<deviceId>-<pubkey-fingerprint>`
   - `signature` — Base64url ed25519 signature

2. **Verification:** The first gogol in every downstream pipeline (`VerifyUpstreamGogol`) automatically:
   - Discovers all `source-signature.json` manifests from the previous pipeline's `.output/<deviceId>/`
   - Loads the matching public key from `transparency/keys/<deviceId>.pem`
   - Verifies the ed25519 signature
   - Re-computes the SHA-256 of the actual artifact and compares it to the manifest's `content_hash`
   - **Throws an error and stops the pipeline if any check fails**

### Key locations

| Directory | Purpose |
| --- | --- |
| `transparency/keys/` | Public SPKI PEM files, one per device (`<deviceId>.pem`) |
| `0-harvest-source/.output/<deviceId>/<step>-sign-source/source-signature.json` | Signature from Phase 0 |
| `1-register-businesses/.output/<deviceId>/<step>-sign-source/source-signature.json` | Signature from Phase 1 |

### Setting up keys

Place the public key PEM of every participating device in:

```
transparency/keys/<deviceId>.pem
```

The signing private key must be configured via environment variable on the device that signs.

#### Generating a new device identity

Use the root-level script (run from the monorepo root):

```bash
# Use hostname as DEVICE_ID
pnpm setup:device-id

# Or specify DEVICE_ID explicitly
pnpm setup:device-id workstation-alpha
```

This script:

- Generates an ed25519 key pair
- Writes `DEVICE_ID` and `DEVICE_SIGNING_KEY` (base64-encoded PKCS8 PEM) to `apps/hdri/.env`
- Writes the SPKI public key to `transparency/keys/<DEVICE_ID>.pem` (commit this file)
- Prints the `signing_key_id` (`<DEVICE_ID>-<fingerprint>`)

**Important:**

- `apps/hdri/.env` contains the private key — **never commit it**
- `transparency/keys/*.pem` are public keys — **commit them** so verifiers on other machines can check signatures
- Re-running without `--force` is blocked to prevent accidental key rotation. Use `--force` only if you intentionally want to invalidate old signatures.

---

## Root Brief Configuration

Factory-level shared configuration lives in `apps/hdri/factory/.input/brief.md`. It is **merged** with each phase's app-local brief (`<phase>/.input/brief.md`), where app-local values override root values.

### Shared index data

Root brief is the single source of truth for geographic and other shared indexes:

```yaml
---
sourceToken: "2026-q3-de-01"
capsuleId: "019..." # UUID v7; one value for the complete quarter
zipcodesTablePath: zipcodes.de.json
---
```

- `zipcodesTablePath` is resolved relative to `apps/hdri/factory/.input/`
- All gogols that need zipcodes (e.g. `EnrichBundeslandGogol`, `SnapshotHarvestGogol`) read this value from the **root brief** (`rootBrief.zipcodesTablePath`)
- If `zipcodesTablePath` is missing or the file cannot be loaded, the gogol **fails fast** (throws an error and stops the pipeline)

### Do not duplicate in app-local briefs

Do **not** add `zipcodesTablePath` to `0-harvest-source/.input/brief.md` or `1-register-businesses/.input/brief.md`. This prevents configuration drift and ensures all phases use the same geographic index.

---

## Phase 0: Harvest Source

**Purpose:** Ingest business catalogs, deduplicate domains, build site catalog.

### Input Requirements

Place catalog files in `.input/batches/<batch-name>/`:

```

For Q3, add only `2026-q3-de-01/` with the new source files. A source may repeat
domains already present in Q2: this creates new provenance occurrences while the
domain keeps the same provisional identity and canonical UUID v7. Never copy Q2
files into the Q3 directory. The accepted source ledger projects the cumulative
Q2+Q3 frame without reparsing or replacing the Q2 segment.

Acceptance writes an atomic Ed25519-signed batch segment containing every raw
file hash, parser identity and parser version. The frozen frame has its own
signature and binds the candidate list to the included batch IDs, ledger head
and the period-scoped `source-occurrences-<period>.ndjson` hash. The signed guard
is committed before either canonical projection becomes visible. A changed file,
signature, frame or repeated batch ID blocks the run without replacing the
previous projection; accepted segments and frames are never repaired in place.
0-harvest-source/.input/
  brief.md
  batches/
    2026-q2-handwerker/
      handwerker.csv
      handwerker-part2.html
    2026-q2-gewerbe/
      gewerbe.mhtml
```

### Run

```bash
pnpm turbo run start --filter=@syrokomskyi/catalog-harvest
```

### Success Criteria

- `0-harvest-source/.output/core_YYYY.db` exists
- `_guide/0-harvest-source/report.md` shows imported sites count
- No ERROR entries in console output

### Troubleshooting

| Problem | Solution |
| --- | --- |
| CSV parsing errors | Check encoding (must be UTF-8), verify delimiter |
| HTML parsing fails | Ensure files are valid HTML, not binary MHTML |
| 0 sites imported | Check file paths, verify batch directory structure |
| Pipeline paused: "Registered 0 site(s), threshold is 1" | Parser produced no registrations. Check parser output, fix source format issues, then clear `source_file_stats` table (or delete `core_YYYY.db`) and rerun. See RFC-0068. |

If the pipeline pauses with "Registered N site(s), threshold is M", the fail-fast guard (RFC-0068) has triggered. This means `SELECT COUNT(*) FROM sites` returned fewer than `minSitesThreshold` (default: 1). To recover:

1. Investigate the root cause (parser bug, source format change, stop domain filter).
2. Fix the parser or source files.
3. Clear `source_file_stats` table or delete `core_YYYY.db` to force re-parsing.
4. Rerun the pipeline.

Do NOT set `minSitesThreshold: 0` to bypass the guard in production.

---

## Phase 1: Register Businesses

**Purpose:** Collect distinct business domains from harvested `core.db` files, deduplicate them into a device-local registry, and mint deterministic `da-*` asset IDs.

### Prerequisites

- `0-harvest-source/.output/core.db` must exist and be signed
- `transparency/keys/` contains the verifying public key(s)

### Input Requirements

Phase 1 uses the same factory-level `.input/brief.md` as Phase 0 (merged with its own app-local `1-register-businesses/.input/brief.md`).

### Run

```bash
pnpm turbo run start --filter=@syrokomskyi/register-businesses
```

### Success Criteria

- `1-register-businesses/.output/registry_YYYY.db` exists
- `1-register-businesses/.output/<step>-sign-source/source-signature.json` exists (signed by `SignSourceGogol`)
- Report shows count of distinct domains registered
- No ERROR entries in console output

### Troubleshooting

| Problem | Solution |
| --- | --- |
| `VerifyUpstreamGogol` fails | Check `0-harvest-source` output exists and `source-signature.json` is valid; verify `transparency/keys/` PEM matches the signing key |
| `DiscoverCoresGogol` finds 0 cores | Check `upstreamHarvestOutputRoot` in config points to correct `0-harvest-source/.output` |
| `MintAssetIdsGogol` duplicates | Ensure `sourceToken` is consistent across the factory chain |

---

## Phase 2: Check Liveness

**Purpose:** Test HTTP/HTTPS availability for all cataloged sites.

### Prerequisites

- `0-harvest-source/.output/core.db` must exist

### Run

```bash
pnpm turbo run start --filter=@syrokomskyi/site-liveness
```

### Success Criteria

- `2-check-liveness/.output/<device>/data/db/liveness-YYYY-qN.db` exists
- Report shows % of live sites (typically 60-80%)
- No timeout errors in bulk

### Troubleshooting

| Problem           | Solution                                       |
| ----------------- | ---------------------------------------------- |
| All sites timeout | Check network connectivity, reduce concurrency |
| 0% live sites     | Verify DNS resolution, check for proxy issues  |
| Process hangs     | Reduce `concurrency` in brief.md               |

---

## Phase 3: Extract Profile

**Purpose:** Crawl homepages of live sites, extract signals.

### Prerequisites

- `core.db` from Phase 0
- `liveness-YYYY-qN.db` from Phase 2 for the same quarter and device

### Configuration Notes

This pipeline has quarter-scoped policies:

- Only live sites are crawled (`liveOnly = true`)
- A terminal result is never fetched again while resuming the same quarter capsule
- A new quarter has a new capsule and therefore captures the site again
- HTTP and network failures are terminal observed evidence after the bounded policy is exhausted

### Run

```bash
pnpm turbo run start --filter=@syrokomskyi/site-profile
```

### Success Criteria

- `3-extract-profile/.output/<device>/data/db/pages-YYYY-qN.db` exists
- `data/content/` contains HTML files in CAS layout
- Report shows >70% crawl success rate

### Signal Extraction

After crawl completes, these signals are extracted automatically:

- Contact info (phone, email)
- Legal pages (impressum, datenschutz, agb)
- Schema.org structured data
- Copyright years
- Opening hours
- Team page detection

### Troubleshooting

| Problem | Solution |
| --- | --- |
| High error rate | Check site-blocking, reduce concurrency, increase timeout |
| Empty ext\_\* tables | Ensure crawl succeeded before signal extraction |
| Out of disk space | Stop the run and add storage; sealed quarterly artifacts are never deleted |

---

## Phase 4: Audit Lighthouse

**Q3 2026 status:** disabled by the instrument plan. Do not run this phase for Q3 and do not substitute missing Lighthouse values with zero.

**Purpose in a future enabled quarter:** Performance audit of all live sites using Lighthouse.

### Prerequisites

- Chrome or Chromium installed
- `core.db` from Phase 0

### Run

```bash
pnpm turbo run start --filter=@syrokomskyi/site-lighthouse-audit
```

### Success Criteria

- `4-audit-lighthouse/.output/<device>/data/db/lighthouse-YYYY-qN.db` exists
- `lighthouse_runs` table populated
- Report shows audit completion rate

### Troubleshooting

| Problem          | Solution                                       |
| ---------------- | ---------------------------------------------- |
| Chrome not found | Install Chrome or set CHROME_PATH env var      |
| Page timeout     | Increase `timeoutMs` in brief.md               |
| Audit crashes    | Reduce concurrency, Chrome is memory-intensive |

---

## Phase 5: Audit Axe

**Purpose:** Accessibility audit of all live sites using axe-core.

### Prerequisites

- Playwright browsers installed:
  ```bash
  pnpm exec playwright install chromium
  ```
- `core.db` from Phase 0

### Run

```bash
pnpm turbo run start --filter=@syrokomskyi/site-axe-audit
```

### Success Criteria

- `5-audit-axe/.output/<device>/data/db/axe-YYYY-qN.db` exists
- `axe_runs` table populated with violation counts
- Report shows audit completion rate

### Troubleshooting

| Problem               | Solution                                    |
| --------------------- | ------------------------------------------- |
| Playwright not found  | Run `pnpm exec playwright install chromium` |
| Browser launch fails  | Check system dependencies for Playwright    |
| High violation counts | This is expected, not an error              |

---

## Full Chain Execution

To run all pipelines in sequence:

```bash
# Ensure all prerequisites
pnpm turbo run build --filter=@syrokomskyi/pipeline-core --filter=@syrokomskyi/pipeline-node --filter=@syrokomskyi/pipeline-steps

# Run full chain
cd apps/hdri/factory
pnpm turbo run start --filter=@syrokomskyi/catalog-harvest
pnpm turbo run start --filter=@syrokomskyi/register-businesses
pnpm turbo run start --filter=@syrokomskyi/site-liveness
pnpm turbo run start --filter=@syrokomskyi/site-profile
# Q3: Lighthouse is explicitly disabled
pnpm turbo run start --filter=@syrokomskyi/site-axe-audit
pnpm turbo run start --filter=@syrokomskyi/contract-ontology
```

Or use the monorepo root:

```bash
pnpm turbo run start --filter=@syrokomskyi/catalog-harvest --filter=@syrokomskyi/register-businesses --filter=@syrokomskyi/site-liveness --filter=@syrokomskyi/site-profile --filter=@syrokomskyi/site-axe-audit
```

**Note:** This runs dependencies in parallel where possible, but respects the pipeline chain order.

### Safe restart contract

Liveness, profile and Axe freeze their complete target set before the first network request and append lease, retry and terminal events under the quarter capsule. Leases are atomic filesystem claims with durable attempt ordinals and fencing: a second process cannot request the same WorkKey, and an expired owner cannot commit after a replacement takes over. Active browser/network work writes append-only heartbeats that extend its lease. Each frozen target set is retained, and completeness is committed as an Ed25519-signed stage seal. Mutable SQLite rows are checkpoints only. After power or network loss, rerun the same stage with the same `period` and `capsuleId`: terminal work is restored from immutable CAS evidence and is not requested again. `maxDomains` sessions are diagnostic and never seal a stage.

Do not edit a brief, instrument version or target frame after work has begun. Configuration or target drift is rejected. A full stage seals only when every declared target has a successful or observed-failure result. The bridge verifies the frozen target count/hash, exactly one matching stage-sealed event, every selected terminal event and CAS object, and the collector-bound Ed25519 stage seal before creating emit output. Therefore a diagnostic `maxDomains` run cannot be mistaken for a complete quarter.

### One selected-attempt authority (RFC-0114)

Every HDRI producer commits through a single fenced durable authority in `@syrokomskyi/factory-core`. The authority allocates work keys, attempt ordinals, and lease epochs transactionally. Sealed, content-verified projections are the only downstream observation inputs — the translator (`TranslateOntologyGogol`) consumes verified immutable snapshot handles and selected-result projections, never mutable device databases directly.

Key properties:

- **Durable selection**: The greatest allocated epoch is authoritative even after expiry. An older lease never revives. Result selection is persisted in the same transaction that verifies the lease.
- **Immutable snapshots**: The translator uses the SQLite backup API to create consistent read-only snapshots. Mutating the live database after snapshot creation has no effect on translation output.
- **Digest domains**: Expected work-set, terminal work-set, selected-result, and projection digests are distinct semantic domains. A verifier derives each from actual sorted values; digests are never copied across domains.
- **Mutation detection**: If an admitted snapshot value is changed, the translator rejects its closure. Altering a selected value without changing target membership requires digest/closure rejection.
- **Cryptographic admission**: Full admission includes trusted Ed25519 signatures, not merely the manifest field shape. Every consumed observation resolves to one durable selected attempt.

### Quarter closure

The contract bridge creates a staging capsule containing the signed source-ledger segments, raw batch files, occurrence projection, signed frozen frame, consistent SQLite backup snapshots, execution journal, referenced profile HTML, referenced Axe reports, signed observations and methodology. Observatory adds canonical UUID v7 identity, vault shards and publication artifacts after the release gate, then writes `capsule-manifest.json` and detached `capsule-signature.json`. Until both files exist and verify, the quarter is not sealed and must not be published or used as the starting point for the next quarter. A retry first verifies an existing staging/final closure and performs no writes inside it. Before copying source evidence, the bridge verifies every segment signature, the signed frame, the ledger head, included batch set and occurrence-projection hash; any mismatch fails before the capsule is written. The head is rebuilt from the frame's exact signed `includedBatchIds`, so appending Q4 segments does not invalidate Q3. Expected source hashes come from that verified snapshot and are checked again on the copied capsule artifact, closing mutation races between preflight and retain. Observatory repeats the complete execution-evidence verification before final sealing and whenever it reopens an already sealed capsule.

---

## Output Artifacts

After complete chain:

```
apps/hdri/factory/
  0-harvest-source/.output/
    core_YYYY.db               # Site catalog
    _guide/0-harvest-source/   # Reports
    <step>-sign-source/        # Signature manifest
  1-register-businesses/.output/
    registry_YYYY.db           # Deduplicated business registry
    <step>-sign-source/        # Signature manifest
  2-check-liveness/.output/
    liveness-YYYY-qN.db        # Availability status
  3-extract-profile/.output/
    pages-YYYY-qN.db           # Page observations + ext_* signals
    data/content/              # CAS HTML storage
  4-audit-lighthouse/.output/
    lighthouse-YYYY-qN.db      # optional Lighthouse metrics
    data/audit-reports/        # CAS audit JSON
  5-audit-axe/.output/
    axe-YYYY-qN.db             # Axe violations
    data/audit-reports/        # CAS audit JSON
```

---

## Qualification harness (RFC-0111)

The factory chain is qualified end-to-end by the `quarter:rehearse` harness in the observatory. The harness coordinates app launchers through declared executable/path adapters, measures RSS/inodes/disk, injects faults, and produces a `QualificationReceipt`.

- Small full-chain CI gate (100 targets): runs as part of the observatory test suite on every HDRI/shared dependency change.
- Weekly 10k rehearsal: runs on a provisioned runner, extending the existing weekly CI schedule.
- Pre-quarter 200k qualification: triggered manually before each quarter's live capture on a separately provisioned runner.

See `apps/hdri/observatory/RUNBOOK.md` § Qualification harness (RFC-0111) for full details.

---

## Next Steps

After factory completes, proceed to `apps/hdri/observatory` for:

- Asset state tracking
- HDRI scoring
- Mart generation

See `apps/hdri/observatory/RUNBOOK.md`

---

## RFC-0112: Quarterly Continuity and Obsolete Path Retirement

### Quarter initialization

Use `quarter:init --predecessor <capsule-manifest> --period <yyyy-qn>` to initialize a new quarter. The tool:

- Verifies the predecessor capsule manifest and signature
- Creates/updates `prior-capsules.json` with cumulative source ledger entries
- Persists a `QuarterRecord` with collection status, predecessor reference, and capsule identity
- Is idempotent: re-running with the same `--period` returns the same record and capsule ID

### Cross-year continuity (Q4 → Q1)

When initializing Q1 after Q4, the quarter record references the previous year's Q4 collection lineage. The `discoverQuarterRecord` function computes the predecessor period using `computePredecessorPeriod`, which handles year rollover automatically (Q4 → Q1 of next year).

### Gap records

If a historical quarter is missing (no predecessor capsule found), the ledger creates a gap record with `collection: "gap"` and `predecessorManifestSha256: null`. An explicit `gapDecisionSha256` must be provided to document the gap reason.

### Readiness receipts

`quarter:readiness --period <yyyy-qn>` binds preservation, qualification, predecessor, and capacity evidence digests into a `ReadinessReceipt`. The receipt status is `ready` only when all evidence is present and no obsolete runtime entries remain.

### Preservation checks

`preservation:check --archive-root <dir> --policy <file>` requires a nonempty JSON object mapping exact relative POSIX paths to lowercase SHA-256 digests. The policy belongs outside the scanned closure. Missing, unlisted, mismatched, unsafe and symlinked objects produce `status: "degraded"` and a nonzero exit. No basename fallback or inventory-free success is allowed. This check verifies bytes against the supplied inventory; authenticating that inventory remains an admission prerequisite, not a property of this diagnostic.

### Obsolete path retirement

`quarter:seal-legacy` (RFC-0045) has been removed. No legacy dual mode survives. The readiness gate rejects any remaining obsolete runtime entries with `OBSOLETE_RUNTIME_REMAINS` blocker.

---

## Verified admission and custody (RFC-0113)

### Typed admission input

All factory and observatory entry points use `VerifiedAdmissionInput` from `@syrokomskyi/factory-core` instead of the old string-based `ProgramGateInput`. The admission gate (`evaluateProgramGate`) now consumes typed `EvidenceRef` objects with `schema`, `uri`, `bytes`, and `sha256` fields — not arbitrary string digests.

- **`createBootstrapAdmission`** creates a `VerifiedAdmissionInput` with all evidence refs set to `null` — the initial blocked state.
- **`AdmissionInput`** (schema `hdri-admission-input@1`) is the JSON contract for loading verified evidence from disk.
- Each `EvidenceRef` carries a 64-character hex `sha256` digest. Invalid digests are rejected at parse time.

### Preservation (A1)

`preserve:q2` performs real Q2 preservation with SQLite snapshotting, per-destination receipts, and hash-once-copy-exact semantics. Source and destination directories must not overlap. Each destination has independent failure domain, medium, and credential boundary. Content manifests are signed with Ed25519 and written at every destination.

`baseline:import` converts archived Q2 evidence to current-format baseline with identity mapping. Unknown/ambiguous historical identities block admission — no invented canonical IDs. The conversion produces a detailed comparison report with per-table counts and zero unexplained differences.

### Append-only quarter ledger (A3)

`quarter:init` writes per-period immutable revisions to `quarter-ledger/` instead of overwriting `quarter-record.json`. Each revision is chained to its predecessor via `previousRevisionDigest`. Old heads are preserved byte-for-byte. The ledger index (`ledger-index.json`) tracks all revisions atomically.

### Policy manifest authentication

`preservation:check` accepts `--manifest-sha256 <hash>` to authenticate the policy manifest against a verified SHA-256 hash before using it. Unauthenticated policy files are rejected.

### Quarter readiness from verified evidence

`quarter:readiness` accepts `--evidence-input <path>` pointing to an `AdmissionInput` JSON file. Evidence refs are extracted and verified from the typed input instead of hashing arbitrary files. Unverified strings without valid SHA-256 digests are rejected.
