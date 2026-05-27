---
title: Build Cohorts
factory: build-cohorts
summary: >
  Assigns scored assets to a cohort, stratifies by gewerk_group and
  bundesland, runs aggregateCohort() to compute per-stratum statistics,
  and writes cohort_aggregates.
decisionType: auto
artifacts:
  - id: cohort-summary
    format: json
    description: JSON with cohort id, member count, aggregate stats
---

# Build Cohorts

Creates a cohort from the current run's scored assets, computes summary
statistics (mean, p10, p25, p50, p75, p90) per dimension and stratum axis.
