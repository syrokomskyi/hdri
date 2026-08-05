---
# Canonical batch identifier — sole axis of idempotency for the factory.
# Format: yyyy-q<n>-cc[<-extra>]   (n = quarter, cc = ISO 3166-1 alpha-2 country)
sourceToken: "2026-q3-de-01"

# UUID v7 minted once for this quarterly capsule.
# Must be identical across all Factory and Observatory briefs.
capsuleId: "0198f000-0000-7000-8000-000000000000"

# Path to zipcodes JSON table for geographic enrichment (shared factory-level index)
zipcodesTablePath: zipcodes.de.json

# Minimum total registered sites required before sealing (default: 1).
# Set to 0 to disable the guard (testing only — never use in production).
# minSitesThreshold: 1
---

# Harvest Brief

This brief configures the catalog harvest pipeline.

## What This Does

- Reads business catalog files (CSV/HTML/MHTML) from `.input/batches/`
- Deduplicates websites by domain
- Stores results in `core.db`

## Required Input

Place catalog files under `.input/batches/`:
```
.input/
  batches/
    batch-a/
      catalog.csv
      more-data.html
    batch-b/
      additional.mhtml
```

## sourceToken Format

`yyyy-qn-cc[-extra]`
- `yyyy` — year (e.g., 2026)
- `qn` — quarter (q1, q2, q3, q4)
- `cc` — country code (e.g., de, at, ch)
- `extra` — optional suffix for multiple runs

## Output

- `core.db` — site catalog with deduplicated domains
- `.output/_guide/` — execution reports
