---
sourceToken: "2026-q2-de-05"
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
