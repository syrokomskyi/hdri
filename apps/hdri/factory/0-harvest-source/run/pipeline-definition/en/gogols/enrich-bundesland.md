---
factory: enrich-bundesland
title: Enrich Bundesland
type: deterministic-geo-resolution
purpose: >-
  Deterministically resolve each site's German state (Bundesland) from ALL
  postal_code and city signals across all source files, handling multi-source
  conflicts via consensus/majority/tie-breaker algorithm. Writes resolved state
  to sites.bundesland in core.db.
details: >-
  Reads zipcodesTablePath from brief to build postal-code-to-Bundesland lookup
  and city-to-Bundesland multi-mapping (cities may exist in multiple states).

  For each site, collects ALL geo signals from site_source_seeds (not just
  first), resolves each to candidate Bundesland, then applies deterministic
  selection: postal-consensus > postal-majority > postal-tie-breaker >
  city-unique > city-majority > city-tie-breaker > unresolved.

  Sites with conflicting signals (different states from different sources)
  are flagged as conflicts but still resolved via tie-breaker. All sites
  without geo signals remain NULL.

  Skipped entirely when zipcodesTablePath is not configured.

  Output enrich-bundesland.json contains full report with resolution metrics,
  method breakdown (postal-consensus, postal-majority, city-unique, etc.),
  conflict count, and state distribution.

  Output enrich-bundesland.md is a human-readable enrichment summary with
  resolution methods table and conflicts section.

  Output geo-resolutions.csv contains per-site resolution details
  (domain, site_id, resolved_state, method, confidence, postal candidates,
  city candidates, distinct states found, seed count).

  Output geo-conflicts.csv lists sites with conflicting signals
  (domain, site_id, conflicting states, postal signals, city signals, seed count).
inputs:
  - core.db — sites and site_source_seeds.
  - brief.zipcodesTablePath — path to zipcodes.de.json lookup table.
outputs:
  - enrich-bundesland.json
  - enrich-bundesland.md
  - geo-resolutions.csv
  - geo-conflicts.csv
definitionOfDone:
  - enrich-bundesland.json exists in the gogol output directory.
  - geo-resolutions.csv exists with header and at least header row.
  - geo-conflicts.csv exists (may be empty if no conflicts).
---
