---
title: Site Liveness — T1 Availability Pipeline
quickStart:
  - Create apps/hdri-factory/2-check-liveness/.input/brief.md with scanYear, scanMonth, scanToken, and registryDbPath.
  - Ensure 1-register-businesses has been run first so registry.db is populated.
  - Run the pipeline; review artifacts in .output/ after each phase.
  - The final liveness.db snapshot is the data contract for downstream pipelines (site-profile, hdri-scoring).
operatingRules:
  - Each run is idempotent — re-running updates existing liveness_checks rows (ON CONFLICT DO UPDATE).
  - livenessBatchId is derived from brief fields; same brief = same batch ID.
  - registry.db is opened read-only; site-liveness never modifies 1-register-businesses data.
  - isLive = HTTP status < 500; 4xx sites are considered live (server is up).
  - HTTPS is tried first; HTTP fallback is attempted only on network-level failure.
members:
  - setup
  - check
---

