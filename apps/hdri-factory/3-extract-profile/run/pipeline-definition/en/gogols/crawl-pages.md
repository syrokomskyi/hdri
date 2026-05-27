---
factory: crawl-pages
title: Crawl
purpose: >-
  Fetch homepages for live domains, persist HTML in CAS, and write
  page_contents, page_observations, and site_pages rows.
details: >-
  Reads live domains from liveness.db (liveness_checks where is_live=1,
  filtered by brief.livenessBatchId when set). For each domain, calls
  fetchPageContent() from @org/business-crawler: tries HTTPS first, then HTTP
  on any network-level failure. Stores raw HTML on disk under
  data/content/{sha256[0:2]}/{sha256}.html (CAS). Upserts page_contents,
  site_pages (pages_YYYY.db), and page_observations. No signal extraction is
  performed — that is the responsibility of the Extract gogols in Phase 2.
  Runs with bounded concurrency (brief.concurrency). Respects rescanPolicy
  (skip / if-stale / always). If brief.liveOnly is false, all domains from
  registry.db are targeted regardless of liveness.
inputs:
  - liveness.db — read-only source of live domains.
  - registry.db — read-only; sites table for domain lookup.
  - brief.concurrency, brief.timeoutMs, brief.maxDomains, brief.liveOnly, brief.rescanPolicy.
outputs:
  - crawl-report.json — fetch counts per batch.
  - crawl-report.md — human-readable summary.
  - pages-crawled.csv — per-domain result (domain, ok, status, is_new_content, error_code).
  - HTML files on disk under .output/data/content/
definitionOfDone:
  - crawl-report.json exists in the gogol output directory.
---
