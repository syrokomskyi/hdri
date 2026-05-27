---
factory: emit-bundle
title: Emit Bundle
purpose: >-
  Write the canonical observation bundle using EmitBundleWriter for
  consumption by apps/digital-observatory.
details: >-
  Creates an EmitBundleWriter with app metadata (app_id, collector_version,
  ontology_version), writes every signed observation, commits the bundle,
  and persists the manifest. The emit directory is cleaned before writing.
inputs:
  - Signed observations from sign-bundle.
  - Brief period, ontologyVersion for bundle metadata.
outputs:
  - emit-bundle — directory under .output/emit/<period>/ with the bundle.
  - manifest.json — bundle manifest with observation_count and bundle_hash.
definitionOfDone:
  - manifest.json exists with observation_count > 0.
---
