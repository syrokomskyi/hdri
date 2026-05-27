---
title: Score HDRI
factory: score-hdri
summary: >
  Reads observations per asset from observatory.db, converts them to
  SiteSignals, applies the HDRI codebook via scoreSite(), and writes
  scores, score_dimensions, and score_indicator_traces.
decisionType: auto
artifacts:
  - id: score-summary
    format: json
    description: JSON with scored count, codebook version, skipped count
---

# Score HDRI

Pure-function scoring: observations → SiteSignals → scoreSite() → scores DB.
Every score row carries a computation_hash for full theory reconstruction.
