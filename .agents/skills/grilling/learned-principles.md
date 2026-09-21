# Learned Principles (L2)

Concrete principles distilled from past grilling sessions. Each principle has a condition and a recommended answer. The skill checks these before asking the operator.

<!-- Entries are appended by the skill after meta-analysis and operator approval. -->
<!-- Format:
## <principle title>
- **Condition:** <when this applies>
- **Recommended answer:** <what to recommend>
- **confirmations:** <N>
- **Added:** <date>
-->

## Durability never lives in the least stable environment

- **Condition:** A system has distributed clients and a horizon longer than a year.
- **Recommended answer:** Thin executor clients; the system of record lives where stability and cheap operations are. The less code and state live in the browser/on-device, the better — that environment churns most.
- **confirmations:** 1
- **Added:** 2026-09-14

## Destructive merges are forbidden — merging reassigns attachments

- **Condition:** Any operation that merges or rewrites records owned by others.
- **Recommended answer:** Append-only observations + derived state; merge is reversible reassignment of attachments, history stays immutable. Never destroy data to unify identity.
- **confirmations:** 1
- **Added:** 2026-09-14

## Content addressing as the universal dedup and audit mechanism

- **Condition:** Repeated data from many sources, or a multi-year storage horizon.
- **Recommended answer:** sha256-keyed objects with write-if-absent semantics. Cross-source dedup, tamper evidence, and byte-cheap references come for free; one canonical-JSON implementation, nobody re-implements hashing.
- **confirmations:** 1
- **Added:** 2026-09-14

## The core stores; lenses interpret

- **Condition:** Analytics, scoring, or "views" over data that will knowingly change over time.
- **Recommended answer:** Interpretation is a named, versioned, pluggable methodology (lens) recomputed by replay — not core schema, not core fields. Adding a lens must never change the core; changing a weight is a lens version bump.
- **confirmations:** 1
- **Added:** 2026-09-14

## Unresolved risk becomes a designed switch, not a prohibition

- **Condition:** Legal or policy uncertainty (GDPR, retention, jurisdiction) blocking an architectural decision.
- **Recommended answer:** Design, implement, and test the mitigation mechanism (e.g. evidence revocation), ship it disabled by default with a documented operator-accepted risk. Flipping it later is a policy change, not a re-architecture.
- **confirmations:** 1
- **Added:** 2026-09-14
