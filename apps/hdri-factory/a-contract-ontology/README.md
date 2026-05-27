# a-contract-ontology

Single bridge from the multi-device factory to the Digital Observatory.

**Status: Phase A scaffold — full implementation lands in Phase B.**

## What it does (Phase B target)

Reads outputs of every preceding factory app from every collaborating device,
applies the signal ontology, signs each Observation, and emits a single
quarterly bundle that the observatory consumes.

Pipeline (Phase B):

1. **discover-sources** — walk sibling `0..5` apps' `.output/<deviceId>/`
   subtrees (skip device folders starting with `-`); collect all DBs whose
   `sourceToken` falls inside the `period` (e.g. all `*-Q2-*` for `2026-Q2`).
2. **validate-ontology** — load `.input/ontology.yaml`; reject observations
   whose `signal_path` is unknown or deprecated.
3. **resolve-conflicts** — for each `(asset_id, signal_path)` pair seen on
   multiple devices, keep last-write-wins by `recorded_at`. Write losers to
   `.evidence/<DEVICE_ID>/conflict-log.ndjson`.
4. **sign-bundle** — per-Observation ed25519 signature using
   `loadSigningKeyFromEnv()` (DEVICE_SIGNING_KEY).
5. **emit-bundle** — write `.output/<DEVICE_ID>/<step>-emit/<period>/`:
     - `manifest.json` (period, ontology_version, app versions, bundle_hash)
     - `observations.ndjson` (signed)
     - `evidence/` (content-addressed artifacts)

## Why lettered (`a-`) instead of numbered

Numbered apps (0..5) collect data and may grow over time (new probes added).
Lettered apps (`a-`, `b-`, ...) sit at the post-collection layer and run **after**
all numeric apps complete. Adding a new probe never requires renaming this app.

## Data Coverage: Live Sites Only

This pipeline only processes sites that passed the upstream liveness check. The filtering cascade:

| Stage | What happens to dead sites |
|-------|---------------------------|
| `0-harvest-source` | All sites ingested into `core_*.db` |
| `1-register-businesses` | Domains deduplicated in `registry_*.db` |
| `2-check-liveness` | `liveness_checks.is_live = 0` for dead sites |
| `3-extract-profile` | **Only `is_live = 1` sites are crawled**; dead sites never enter `pages_*.db` |
| `a-contract-ontology` | Reads only from `pages_*.db` — dead sites are invisible |

**Result**: The emit-bundle contains only live-site observations. Sites that failed liveness checks are not represented in the output — neither as observations nor as explicit "dead site" records. The Digital Observatory therefore has no knowledge of the original population size or mortality rate.

**Note**: The current ontology (`signal-ontology-v1.json`) has no `availability.*` or `liveness.*` signals. Adding liveness awareness would require either:
- Extending `EXT_SIGNAL_MAP` with liveness signals (requires `2-check-liveness` output in `ext_*` tables)
- Or: Separate emit-bundle from `2-check-liveness` directly to the observatory

## brief.md

```yaml
period: "2026-Q2"            # hard quarterly boundary; all sourceTokens *-Q2-* are in scope
ontologyVersion: "1.0.0"
skipGogols: []
```

`sourceDevices` is **not** specified — the discover-sources gogol auto-walks
all sibling `<deviceId>/` folders except those starting with `-`.

`cutoffAt` is **not** specified — the period (`YYYY-Qn`) is itself a hard
boundary and computes the date range deterministically.

See `MIGRATION-NEXT-STEPS.md` at the repo root for the Phase B implementation plan.
