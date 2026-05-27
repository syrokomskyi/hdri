---
factory: discover-sources
title: Discover Sources
purpose: >-
  Walk every device folder in the 3-extract-profile output root and find
  pages_*.db files that match the current pipeline period.
details: >-
  Iterates device folders under upstreamOutputRoots.profile, checks each
  pages_<sourceToken>.db against the brief period, and locates the matching
  registry_<year>.db from 1-register-businesses on the same device.
  Sources where the registry DB is missing are skipped with a warning.
inputs:
  - upstream profile output root (3-extract-profile).
  - upstream registry output root (1-register-businesses).
  - brief period for matching.
outputs:
  - discovered-sources.json — list of discovered pages_*.db with paths and device ids.
definitionOfDone:
  - discovered-sources.json exists with at least one source entry.
---
