---
factory: extract-link-industry-catalogs
title: Extract Link to Industry Catalogs
purpose: >-
  Detect links to industry catalog sites on crawled pages.
details: >-
  Scans all <a href> elements for outbound links whose hostname matches known
  catalog sites: gelbeseiten.de, yelp.de/yelp.com, 11880.com, meinestadt.de,
  branchenbuch.de, wlw.de, europages.de, firmenwissen.de, cylex.de, klicktel.de,
  dasoertliche.de, herold.at. No HTTP requests are made.
  Writes one row per content_sha256 to ext_link_industry_catalogs.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_link_industry_catalogs rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
