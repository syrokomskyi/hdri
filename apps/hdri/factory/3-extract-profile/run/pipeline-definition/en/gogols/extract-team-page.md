---
factory: extract-team-page
title: Extract Team / About-Us Page
purpose: >-
  Detect team or about-us page links on crawled pages.
details: >-
  Scans <a href> elements for keywords: unser-team, uber-uns, about-us, team,
  mitarbeiter, wir-sind, wer-sind-wir, uber-mich, etc. Uses url_norm from
  registry.db as baseUrl for relative href resolution. Writes one row per
  content_sha256 to ext_team_page with url and confidence.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
  - registry.db (ATTACH, read-only) — provides url_norm for baseUrl resolution.
outputs:
  - ext_team_page rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
