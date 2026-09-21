# @syrokomskyi/factory-core

Shared factory utilities for HDRI quarterly collection work.

## Key modules

- **execution-store** — Append-only execution evidence store with CAS objects, signed stage seals, and lease coordination.
- **execution-journal** — Deterministic terminal-result selection and stage completeness assertions.
- **quarter-contracts** — Core HDRI types: WorkKey, WorkState, instrument plans, capsule IDs.
- **hdri-durable-execution** — RFC-0101: SQLite transactional sequence authority, MeasurementEvidence, OrderedExecutionEvent, fenced lease epochs, sealed journal segments.
- **source-ledger** — Frozen frame integrity and signed ledger manifests.
- **capsule** — Quarter capsule writing, validation, and signature verification.
- **prior-capsules** — Read-only verification of the actual detached-signature capsule format and its signed source closure. References must match the verified quarter, capsule and batch set; the predecessor digest binds exact manifest bytes. This does not import historical rows or authorize collection.
- **program-gate** — RFC-0099: HDRI forward-only reliability program gate.

## Historical verification

Historical results retain their period and methodology; a new quarter does not make them obsolete. Prior-source verification rejects ambiguous multiple frames and legacy bypass flags. Use stable, writer-excluded retained roots: file checks are not a filesystem snapshot. See [verification limits and next steps](../../docs/reviews/code/packages-factory-core/review-2026-09-15-21-15-packages-factory-core.md).

## RFC markers

- RFC-0026: Durable event journal and resumable quarter execution.
- RFC-0099: Program gate contract and fail-closed decisions.
- RFC-0100: Q2 evidence preservation and baseline import.
- RFC-0101: Crash-safe HDRI execution with provenance-complete evidence.
