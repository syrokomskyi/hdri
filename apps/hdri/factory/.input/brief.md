---
# Canonical batch identifier — sole axis of idempotency for the factory.
# Format: yyyy-q<n>-cc[<-extra>]   (n = quarter, cc = ISO 3166-1 alpha-2 country)
sourceToken: "2026-q3-de-01"

# UUID v7 minted once for this quarterly capsule.
# Must be identical across all Factory and Observatory briefs.
capsuleId: "0198f000-0000-7000-8000-000000000000"

# Path to zipcodes JSON table for geographic enrichment (shared factory-level index)
zipcodesTablePath: zipcodes.de.json
---
