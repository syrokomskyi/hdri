---
factory: translate-ontology
title: Translate Ontology
purpose: >-
  Connect to each discovered pages_*.db, read every ext_* table row, and
  translate each into a typed Observation according to the ontology.
details: >-
  Iterates over EXT_SIGNAL_MAP, reads ext_* table rows, validates signal
  paths against the ontology, and maps content_sha256→domain via a join
  through registry.site_pages and registry.sites. Unknown signals are
  skipped and logged to unknown-signals.json. Deprecated signals are still
  translated for backwards compatibility.
inputs:
  - discovered-sources from the previous gogol.
  - upstream pages_*.db databases.
  - ontology.yaml loaded at bootstrap.
outputs:
  - unknown-signals.json — list of signal paths not in the ontology.
definitionOfDone:
  - All ext_* rows are translated into in-memory observations.
---
