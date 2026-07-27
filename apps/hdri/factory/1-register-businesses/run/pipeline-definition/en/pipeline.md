---
title: Register Businesses — T1 Registry Pipeline
quickStart:
  - Ensure 0-harvest-source completed with signed core.db.
  - Ensure transparency/keys/ contains the verifying public key.
  - Run the pipeline; review artifacts in .output/ after completion.
  - The final registry_YYYY.db is the data contract for downstream pipelines.
operatingRules:
  - Each run is idempotent — re-run safely without data loss.
  - Upstream signature verification fails fast if source-signature.json is missing or invalid.
  - Registry uses device-local deduplication; same domain seen on multiple devices is merged.
  - Asset IDs are derived deterministically from the domain.
members:
  - register-businesses
---
