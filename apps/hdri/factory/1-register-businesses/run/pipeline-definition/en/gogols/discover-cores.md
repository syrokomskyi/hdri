---
factory: discover-cores
title: Discover Cores
purpose: Discover upstream core_YYYY.db files from all devices.
details: >-
  Walks the upstream 0-harvest-source output directory to find core_YYYY.db
  files from every device. Reports discovered files with device ID, path,
  and byte size.
inputs:
  - Upstream harvest output root directory.
outputs:
  - discovered-cores.json listing all found core DBs.
definitionOfDone:
  - discovered-cores.json exists.
---
