# @org/observatory-core

Canonical types, ontology model, validation, and hashing for the Digital Observatory.

## Subpath exports

| Import path | Description |
|---|---|
| `@org/observatory-core` | All types, IDs, hashing, observation builder, ontology basics |
| `@org/observatory-core/ontology` | Full ontology types, Zod schema, validator |
| `@org/observatory-core/hashing` | SHA-256 and stable JSON hashing |

## Key concepts

- **Observation** — immutable atomic signal value for one asset at one point in time.
- **AssetState** — SCD-2 slowly changing dimension for asset metadata.
- **SignalOntology** — versioned dictionary of semantic signal paths.
- **Observation builder** — `boolObs()`, `numObs()`, `strObs()`, `jsonObs()` helpers enforce exactly-one-value invariant.
- **Hashing** — deterministic `sha256Json()` and `computationHash()` for provenance and theory reconstruction.
