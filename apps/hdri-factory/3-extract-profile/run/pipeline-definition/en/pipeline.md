---
title: Site Profile — T2 Homepage Crawler Pipeline
quickStart:
  - Create apps/hdri-factory/3-extract-profile/.input/brief.md with profileYear, profileHalf, profileToken, registryDbPath, livenessDbPath, and livenessBatchId.
  - Ensure site-liveness has been run so liveness.db is populated with live domains.
  - Run the pipeline; review artifacts in .output/ after each phase.
  - The final pages_YYYY.db snapshot is the data contract for downstream pipelines (hdri-scoring).
operatingRules:
  - Each run is idempotent — all writes use ON CONFLICT DO UPDATE or DO NOTHING.
  - profileBatchId is derived from brief fields; same brief = same batch ID.
  - liveness.db is opened read-only; site-profile never modifies site-liveness data.
  - registry.db is opened read-write; site-profile owns the site_pages table.
  - HTML content is stored in CAS (content-addressable storage) on disk, not in SQLite.
  - HTTPS is tried first; HTTP fallback is attempted on network-level failure.
  - Rule-based extractor version is "rule-v3"; a new extractor_ver triggers re-extraction.
members:
  - setup
  - crawl
  - extract
  - fetch-detected
  - summarize
---

