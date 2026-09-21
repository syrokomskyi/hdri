# @syrokomskyi/observatory-emit

Writer and streaming readers for the sole current partitioned NDJSON emit format
(`schema_version: "3"`). Observation, asset-state and evidence records use separate
counted/hash-listed partitions in the same bundle.

## Imported evidence

Write `ImportedEvidenceDescriptor` through `EmitBundleWriter.writeEvidence`; read
through `streamEvidence`. Both enforce the generic observatory-core contract on
records claiming converted evidence. Historical payloads and their provenance remain
separate records; no alternate Q2 bundle is introduced. See the
[core descriptor contract](../observatory-core/README.md#imported-evidence-provenance).

The writer validates serialized JSON before writing, including custom `toJSON`
results. The reader validates descriptors before yielding and hashes exact file
bytes, including whitespace and newline framing. Always exhaust iterators to check
the complete counts and hashes. Early return closes the stream but is not proof of
unread data. Source references and target payload hashes still require independent
verification; descriptor validation alone cannot authenticate them.

Readers currently lack preallocation line/manifest bounds and source-path/held-file
stability enforcement required for operational baseline conversion. Do not treat
these reader checks as signature, custody, complete-conversion or admission proof.

## Tests

Run the scoped package test and typecheck scripts. Node tests use SSR source export
conditions and inline observatory-core so changed contracts are tested without
depending on an earlier build. Examples cover import-time separation, unknown times,
malformed claims with matching hashes, exact-byte tampering and early stream closure.
