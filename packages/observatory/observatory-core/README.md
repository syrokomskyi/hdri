# @syrokomskyi/observatory-core

Canonical types, ontology model, validation, and hashing for the Digital Observatory.

## Subpath exports

| Import path | Description |
| --- | --- |
| `@syrokomskyi/observatory-core` | All types, IDs, hashing, observation builder, ontology basics |
| `@syrokomskyi/observatory-core/ontology` | Full ontology types, Zod schema, validator |
| `@syrokomskyi/observatory-core/hashing` | SHA-256 and stable JSON hashing |

## Key concepts

- **Observation** — immutable atomic signal value for one asset at one point in time.
- **AssetState** — SCD-2 slowly changing dimension for asset metadata.
- **SignalOntology** — versioned dictionary of semantic signal paths.
- **Observation builder** — `boolObs()`, `numObs()`, `strObs()`, `jsonObs()` helpers enforce exactly-one-value invariant.
- **Value invariant** — `value.ts` owns the `ObservationValueType` union, `countPopulatedValues` checker, and `makeValueFields` builder in one module.
- **Signal map** — `EXT_SIGNAL_MAP` and `AXE_SIGNAL_MAP` map legacy table names to ontology signal paths. `createSignalMap(ontology)` validates all entries against a loaded ontology at construction time.
- **Hashing** — deterministic `sha256Json()` and `computationHash()` for provenance and theory reconstruction.
