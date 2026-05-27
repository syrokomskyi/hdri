---
outputLanguage: "en"
period: "2026-Q2"

# Preferred: auto-discover bundle from factory workspace root.
# SyncFromFactoryGogol resolves .output/<DEVICE_ID>/ automatically and reads
# manifest.emit_dir for the data file location.
factoryContractDir: ""
factoryContractRootDir: "../hdri-factory/a-contract-ontology"

# Explicit path override (skip auto-discovery):
# factoryContractDir: "../hdri-factory/a-contract-ontology/.output/${DEVICE_ID}"

# Legacy fallback (used if both factoryContractDir and factoryContractRootDir are empty).
factoryEmitDirs: []

sourceDbDir: ""
vaultDir: ""
ontologyVersion: "1.0.0"
codebookVersion: "observatory-v1"
publicMode: false
skipGogols: []
---
