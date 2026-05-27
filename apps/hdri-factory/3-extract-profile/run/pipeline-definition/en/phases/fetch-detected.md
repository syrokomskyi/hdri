---
title: Phase 3 · Fetch Detected Pages
purpose: >-
  Fetches internal pages detected during extraction (impressum, datenschutz, AGB, BFSG,
  widerruf, versand, team) and persists their content in CAS storage.
entryCriteria:
  - Phase 2 (extract) complete; ext_* tables populated with detected URLs for the batch.
  - brief.fetchDetectedPages is true (optional feature flag).
successSignals:
  - Detected pages with present=1 are fetched and stored in CAS.
  - site_pages rows created with source='detected'.
  - page_observations and page_contents rows created for fetched content.
  - ext_* tables updated with detected_page_sha256 linking to fetched content.
exitCriteria:
  - fetch-detected-pages-report.json artifact exists with fetch statistics.
members:
  - fetch-detected-pages
---
