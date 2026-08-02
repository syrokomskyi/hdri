---
title: Phase 1 · Register Businesses
purpose: >-
  Verify upstream signatures, discover core databases from all devices,
  merge distinct domains into a device-local registry, mint deterministic
  da-* asset IDs, and sign the final registry snapshot.
entryCriteria:
  - 0-harvest-source completed with signed core.db and source-signature.json.
  - transparency/keys/ contains the verifying public key(s).
successSignals:
  - All upstream core DB signatures verified.
  - Distinct domains merged into registry_YYYY.db.
  - Asset IDs minted for every domain.
  - Registry snapshot signed with source-signature.json.
exitCriteria:
  - registry_YYYY.db exists.
  - source-signature.json exists in the sign-source output directory.
members:
  - verify-upstream
  - discover-cores
  - merge-registry
  - mint-asset-ids
  - sign-source
---
