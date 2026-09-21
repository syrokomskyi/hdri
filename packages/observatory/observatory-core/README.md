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

## Imported evidence provenance

`parseImportedEvidenceDescriptor(unknown)` returns a detached, deeply frozen
`ImportedEvidenceDescriptor`. Schema `observatory-imported-evidence@1` describes
conversion from retained evidence for any period; it is not a live collection claim.
It requires the source manifest and artifact byte hashes/sizes, exact opaque source
record locators, target kind/asset ID/record ID/payload hash, and separate import time.

| Measurement status | `measuredAt` | Meaning |
| --- | --- | --- |
| `observed` | Original valid timestamp, preserved verbatim | Measurement time known |
| `time-unknown` | `null`, with reason | Source has no usable measurement time |
| `not-observed` | `null`, with reason | No historical observation is claimed |

Only `observed` may target a current Observation. Unknown/not-observed source rows
can target `retained-record` evidence without fabricating observations. Current
Observation and AssetState payloads are unchanged. Reference authentication, target
payload hashes, field agreement and completeness require the importing verifier;
passing this structural parser is not an import receipt or admission decision.

`parseImportedEvidenceIfClaimed` validates imported claims on mixed evidence streams;
it leaves other record kinds to their respective validators.

## Changelog

[CHANGELOG.md](CHANGELOG.md)
