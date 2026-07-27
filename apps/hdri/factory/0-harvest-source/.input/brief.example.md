---
# (Phase A back-compat: harvestYear / harvestQuarter / batchToken are derived
# from sourceToken in code. They remain in the parsed Brief but should not be
# set in this file.)

# Optional: regex patterns applied to source paths to skip files
exclude: []

# Limits (-1 = unlimited)
maxSites: -1

# List of gogol IDs to skip during this run
skipGogols: []
---

# Harvest Brief

This brief configures the catalog harvest pipeline.

## What This Does

- Reads business catalog files (CSV/HTML/MHTML) from `.input/batches/`
- Deduplicates websites by domain
- Stores results in `core.db`
