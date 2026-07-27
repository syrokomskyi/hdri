---
factory: extract-cookie-banner
title: Extract Cookie Banner
purpose: >-
  Detect cookie-consent banners on crawled pages and store results in ext_cookie_banner.
details: >-
  Iterates over page_observations for the current batch. For each unique
  content_sha256, reads the HTML file from CAS, calls extractCookieBanner()
  (CSS selector matching on common cookie-consent widget IDs and class names:
  CybotCookiebotDialog, onetrust-banner-sdk, .cc-window, .cookiealert, and
  generic [id*=cookie], [class*=consent] patterns). Upserts one row into
  ext_cookie_banner. Idempotent: skips content_sha256 already present for the
  current extractor_ver.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_cookie_banner rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
