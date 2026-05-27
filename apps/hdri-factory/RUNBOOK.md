# HDRI-Factory Operator Runbook

Operational guide for running the HDRI (Handwerk Digital Readiness Index) factory pipeline chain.

## Pipeline Overview

The hdri-factory consists of 6 sequential pipelines:

```
0-harvest-source → 1-register-businesses → 2-check-liveness → 3-extract-profile → 4-audit-lighthouse → 5-audit-axe
     ↓                     ↓                      ↓                    ↓                    ↓                    ↓
  core_YYYY.db       registry_YYYY.db       liveness_YYYY.db    pages_YYYY.db    lighthouse_YYYY.db      axe_YYYY.db
```

Each pipeline depends on the previous one. **Always run in order.**

---

## Pre-Flight Checklist

Before starting any pipeline:

- [ ] Upstream pipeline completed (if not first)
- [ ] `.input/brief.md` created from `brief.example.md`
- [ ] `sourceToken` uses correct format: `YYYY-Qn-CC[-extra]`
- [ ] Input data files in correct locations
- [ ] Sufficient disk space (estimate 1GB per 1000 sites)
- [ ] Chrome/Chromium installed (for audit pipelines)

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
|-----------|---------|
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
- Writes `DEVICE_ID` and `DEVICE_SIGNING_KEY` (base64-encoded PKCS8 PEM) to `.env`
- Writes the SPKI public key to `transparency/keys/<DEVICE_ID>.pem` (commit this file)
- Prints the `signing_key_id` (`<DEVICE_ID>-<fingerprint>`)

**Important:**
- `.env` contains the private key — **never commit it**
- `transparency/keys/*.pem` are public keys — **commit them** so verifiers on other machines can check signatures
- Re-running without `--force` is blocked to prevent accidental key rotation. Use `--force` only if you intentionally want to invalidate old signatures.

---

## Root Brief Configuration

Factory-level shared configuration lives in `apps/hdri-factory/.input/brief.md`. It is **merged** with each phase's app-local brief (`<phase>/.input/brief.md`), where app-local values override root values.

### Shared index data

Root brief is the single source of truth for geographic and other shared indexes:

```yaml
---
sourceToken: "2026-q2-de-05"
zipcodesTablePath: zipcodes.de.json
---
```

- `zipcodesTablePath` is resolved relative to `apps/hdri-factory/.input/`
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
pnpm turbo run start --filter=@org/catalog-harvest
```

### Success Criteria

- `0-harvest-source/.output/core_YYYY.db` exists
- `_guide/0-harvest-source/report.md` shows imported sites count
- No ERROR entries in console output

### Troubleshooting

| Problem | Solution |
|---------|----------|
| CSV parsing errors | Check encoding (must be UTF-8), verify delimiter |
| HTML parsing fails | Ensure files are valid HTML, not binary MHTML |
| 0 sites imported | Check file paths, verify batch directory structure |

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
pnpm turbo run start --filter=@org/register-businesses
```

### Success Criteria

- `1-register-businesses/.output/registry_YYYY.db` exists
- `1-register-businesses/.output/<step>-sign-source/source-signature.json` exists (signed by `SignSourceGogol`)
- Report shows count of distinct domains registered
- No ERROR entries in console output

### Troubleshooting

| Problem | Solution |
|---------|----------|
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
pnpm turbo run start --filter=@org/site-liveness
```

### Success Criteria

- `2-check-liveness/.output/liveness_YYYY.db` exists
- Report shows % of live sites (typically 60-80%)
- No timeout errors in bulk

### Troubleshooting

| Problem | Solution |
|---------|----------|
| All sites timeout | Check network connectivity, reduce concurrency |
| 0% live sites | Verify DNS resolution, check for proxy issues |
| Process hangs | Reduce `concurrency` in brief.md |

---

## Phase 3: Extract Profile

**Purpose:** Crawl homepages of live sites, extract signals.

### Prerequisites

- `core.db` from Phase 0
- `liveness.db` from Phase 2

### Configuration Notes

This pipeline has **hardcoded policies** (Phase B):
- Only live sites are crawled (`liveOnly = true`)
- Successful pages are never re-fetched
- Failed pages are always re-fetched on next run

### Run

```bash
pnpm turbo run start --filter=@org/site-profile
```

### Success Criteria

- `3-extract-profile/.output/pages_YYYY.db` exists
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
|---------|----------|
| High error rate | Check site-blocking, reduce concurrency, increase timeout |
| Empty ext_* tables | Ensure crawl succeeded before signal extraction |
| Out of disk space | CAS storage grows with each site, clean old runs |

---

## Phase 4: Audit Lighthouse

**Purpose:** Performance audit of all live sites using Lighthouse.

### Prerequisites

- Chrome or Chromium installed
- `core.db` from Phase 0

### Run

```bash
pnpm turbo run start --filter=@org/site-lighthouse-audit
```

### Success Criteria

- `4-audit-lighthouse/.output/lighthouse_YYYY.db` exists
- `lighthouse_runs` table populated
- Report shows audit completion rate

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Chrome not found | Install Chrome or set CHROME_PATH env var |
| Page timeout | Increase `timeoutMs` in brief.md |
| Audit crashes | Reduce concurrency, Chrome is memory-intensive |

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
pnpm turbo run start --filter=@org/site-axe-audit
```

### Success Criteria

- `5-audit-axe/.output/axe_YYYY.db` exists
- `axe_runs` table populated with violation counts
- Report shows audit completion rate

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Playwright not found | Run `pnpm exec playwright install chromium` |
| Browser launch fails | Check system dependencies for Playwright |
| High violation counts | This is expected, not an error |

---

## Full Chain Execution

To run all pipelines in sequence:

```bash
# Ensure all prerequisites
pnpm turbo run build --filter=@org/pipeline-core --filter=@org/pipeline-node --filter=@org/pipeline-steps

# Run full chain
cd apps/hdri-factory
pnpm turbo run start --filter=@org/catalog-harvest
pnpm turbo run start --filter=@org/register-businesses
pnpm turbo run start --filter=@org/site-liveness
pnpm turbo run start --filter=@org/site-profile
pnpm turbo run start --filter=@org/site-lighthouse-audit
pnpm turbo run start --filter=@org/site-axe-audit
```

Or use the monorepo root:
```bash
pnpm turbo run start --filter=@org/catalog-harvest --filter=@org/register-businesses --filter=@org/site-liveness --filter=@org/site-profile --filter=@org/site-lighthouse-audit --filter=@org/site-axe-audit
```

**Note:** This runs dependencies in parallel where possible, but respects the pipeline chain order.

---

## Output Artifacts

After complete chain:

```
apps/hdri-factory/
  0-harvest-source/.output/
    core_YYYY.db               # Site catalog
    _guide/0-harvest-source/   # Reports
    <step>-sign-source/        # Signature manifest
  1-register-businesses/.output/
    registry_YYYY.db           # Deduplicated business registry
    <step>-sign-source/        # Signature manifest
  2-check-liveness/.output/
    liveness_YYYY.db           # Availability status
  3-extract-profile/.output/
    pages_YYYY.db              # Page observations + ext_* signals
    data/content/              # CAS HTML storage
  4-audit-lighthouse/.output/
    lighthouse_YYYY.db         # Lighthouse metrics
    data/audit-reports/        # CAS audit JSON
  5-audit-axe/.output/
    axe_YYYY.db                # Axe violations
    data/audit-reports/        # CAS audit JSON
```

---

## Next Steps

After hdri-factory completes, proceed to `apps/digital-observatory` for:
- Asset state tracking
- HDRI scoring
- Mart generation

See `apps/digital-observatory/RUNBOOK.md`
