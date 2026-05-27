---
factory: fetch-detected-pages
title: Fetch Detected Pages
purpose: >-
  Fetches internal pages detected during extraction (impressum, datenschutz, AGB, BFSG,
  widerruf, versand, team) and persists their content in CAS storage.
details: >-
  Reads ext_* tables for the current batch to collect detected URLs where present=1
  and url IS NOT NULL. Deduplicates URLs across all ext_* tables (same page may be
  detected by multiple extractors). For each unique URL, calls fetchPageContent()
  from @org/business-crawler: tries HTTPS first, then HTTP on any network-level
  failure. Stores raw HTML on disk under data/content/{sha256[0:2]}/{sha256}.html
  (CAS). Upserts page_contents, site_pages (pages_YYYY.db with source='detected'), and
  page_observations. Updates ext_* tables with detected_page_sha256 linking to
  fetched content. Respects rescanPolicy (skip / if-stale / always). Only runs
  when brief.fetchDetectedPages is true (optional feature flag).
inputs:
  - pages_YYYY.db (read-write) — ext_* tables with detected URLs, site_pages for detected pages.
  - brief.fetchDetectedPages, brief.concurrency, brief.timeoutMs, brief.rescanPolicy.
outputs:
  - fetch-detected-pages-report.json — fetch counts per batch.
  - fetch-detected-pages-report.md — human-readable summary.
  - detected-pages-fetched.csv — per-URL result (url, source_table, ok, status, is_new_content).
  - HTML files on disk under .output/data/content/
definitionOfDone:
  - fetch-detected-pages-report.json exists in the gogol output directory.
---
