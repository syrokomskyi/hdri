---
factory: check-liveness
title: Check Liveness
purpose: >-
  Perform HTTP/HTTPS reachability checks for all domains in registry.db and write
  results to liveness_checks in liveness.db.
details: >-
  Opens registry.db read-only (from 1-register-businesses).
  Queries the sites table. For each domain, calls checkSiteLiveness() from
  @org/business-crawler: tries HTTPS first (HEAD request, GET fallback on 405),
  then HTTP on network-level failure. Records httpStatus, finalUrl, latencyMs,
  isLive, and errorCode. Inserts or updates liveness_checks with ON CONFLICT
  DO UPDATE. Runs checks with bounded concurrency (brief.concurrency).
inputs:
  - read-only source of domains (sites table) from 1-register-businesses.
  - brief.concurrency, brief.timeoutMs, brief.retryCount, brief.maxDomains.
outputs:
  - check-report.json — live/dead counts, avg latency, error breakdown.
  - check-report.md — human-readable summary.
  - domains-checked.csv — per-domain result (domain, is_live, status, final_url, latency).
definitionOfDone:
  - check-report.json exists in the gogol output directory.
---

