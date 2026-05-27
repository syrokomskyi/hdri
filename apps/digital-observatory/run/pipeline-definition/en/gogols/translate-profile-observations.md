---
title: Translate Profile Observations
factory: translate-profile-observations
summary: >
  Reads ext_* tables from the upstream pages database, maps each row to
  canonical ontology-backed observations using the signal map, validates
  them against the ontology, and writes to the observatory database.
decisionType: auto
artifacts:
  - id: translate-summary
    format: json
    description: JSON with observation counts per signal, validation errors
---

# Translate Profile Observations

Bridge from ext_* extraction tables to immutable ontology-backed observations.
