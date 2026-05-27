---
title: Sign Observations
factory: sign-observations
summary: >
  Signs all unsigned observations in the observatory DB using the ed25519 signing key
  loaded from .input/signing-key/. Produces tamper-evident records for vault export
  and public transparency. Must run after sync-from-factory.
decisionType: auto
artifacts:
  - id: sign-report
    format: json
    description: JSON report with signing key metadata, signed count, and any parse errors
---

# Sign Observations

Post-processing step that applies ed25519 signatures to every unsigned observation
in the observatory DB. The signature covers the full canonical `Observation` JSON
(RFC 8785) as emitted by the factory, ensuring the record is tamper-evident from
factory output through to vault publication.

Signing key lives at `.input/signing-key/` (private.pem, public.pem, key-id.txt,
collector-id.txt). Operators generate a key once with `generate-signing-key.ts`.

Idempotent: rows where `signature IS NOT NULL` are skipped.
