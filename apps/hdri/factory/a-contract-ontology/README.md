# a-contract-ontology

Single bridge from the multi-device factory to the Digital Observatory.

**Status: production quarterly bridge.**

## What it does

Reads outputs of every preceding factory app from every collaborating device, applies the signal ontology, signs each Observation, and emits a single quarterly bundle that the observatory consumes.

Pipeline:

1. **discover-sources** — walk sibling `0..5` apps' `.output/<deviceId>/` subtrees (skip device folders starting with `-`); collect all DBs whose `sourceToken` falls inside the `period` (e.g. all `*-Q2-*` for `2026-Q2`).
2. **validate-ontology** — load `.input/ontology.yaml`; reject observations whose `signal_path` is unknown or deprecated.
3. **resolve-conflicts** — for each `(asset_id, signal_path)` pair seen on multiple devices, keep last-write-wins by `recorded_at`. Write losers to `.evidence/<DEVICE_ID>/conflict-log.ndjson`.
4. **sign-bundle** — per-Observation ed25519 signature using `loadSigningKeyFromEnv()` (DEVICE_SIGNING_KEY).
5. **emit-bundle** — create the quarter staging capsule:
   - `manifest.json` (period, ontology_version, app versions, bundle_hash)
   - `observations.ndjson` (signed)
   - signed source-batch segments, raw source bytes, occurrence projection and signed frame manifest
   - immutable execution events, frozen target sets, append-only heartbeats, signed stage seals and result evidence
   - the quarter databases plus every referenced profile HTML and Axe JSON CAS object
   - frozen frame and ontology artifacts

Quarter databases are retained through SQLite's consistent backup mechanism and
checked before and after the snapshot. Existing staging closure is verified
before the bridge returns idempotently; no file inside it is rewritten.
Before the first source artifact is retained, the bridge verifies the full
signed closure: batch envelopes, collector-bound keys, frame signature, ledger
head for the frame's exact included batches, derived frame hash and the
period-specific occurrence projection hash. It retains only bytes matching the
hashes captured by that verification, even if a source changes after preflight.
Before any emit output is created it also reconstructs every required stage from
append-only events, verifies all selected CAS objects and requires the frozen
target and signed stage seal hashes to agree. Partial `maxDomains` sessions are
therefore valid resumable diagnostics but cannot produce a staging capsule.

Observatory later adds the canonical UUID v7 identity map, vault shards,
methodology and publication products. Only then is the capsule closed by
`capsule-manifest.json` and a detached Ed25519 `capsule-signature.json`.
Finalization is fail-closed: Observatory repeats required-stage verification and
an existing manifest is verified before any write, including recovery of a
missing detached signature.

## Why lettered (`a-`) instead of numbered

Numbered apps (0..5) collect data and may grow over time (new probes added). Lettered apps (`a-`, `b-`, ...) sit at the post-collection layer and run **after** all numeric apps complete. Adding a new probe never requires renaming this app.

## Data coverage

Every frame candidate contributes a signed availability observation. Profile and
Axe remain restricted to candidates reachable in the current observation. A
never-live catalog address stays in the restricted source/research archive but
does not enter the profile index. A previously reachable site that becomes
unavailable keeps its canonical UUID v7 and produces website-availability state;
this is never described as business closure.

| Stage | What happens to dead sites |
| --- | --- |
| `0-harvest-source` | All sites ingested into `core_*.db` |
| `1-register-businesses` | Domains deduplicated in `registry_*.db` |
| `2-check-liveness` | `liveness_checks.is_live = 0` for dead sites |
| `3-extract-profile` | **Only `is_live = 1` sites are crawled**; dead sites never enter `pages_*.db` |
| `a-contract-ontology` | Emits availability for the complete frame and profile/Axe signals for reachable targets |

## brief.md

```yaml
period: "2026-q3"
capsuleId: "019..."          # UUID v7 shared by every stage of this quarter
ontologyVersion: "1.0.0"
skipGogols: []
```

`sourceDevices` is **not** specified — the discover-sources gogol auto-walks all sibling `<deviceId>/` folders except those starting with `-`.

`cutoffAt` is **not** specified — lowercase `YYYY-qN` is the immutable boundary.

See the root README for the overall factory pipeline order and prerequisites.
