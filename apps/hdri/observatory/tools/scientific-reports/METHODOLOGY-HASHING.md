# Methodology content-digest convention

`compareMethodologySnapshots` requires all 8 `METHODOLOGY_CONTENT_FIELDS` digests to be present
and identical for `scoreComparable: true`. Each digest is a SHA-256, but the *input* to the hash
differs by component kind — per RFC-0107 ("archive both source bytes and canonical semantic
digests"). Implemented in `methodology-digests.ts`.

## Two conventions

**Raw source bytes → sha256** — for declarative artifacts whose bytes are the contract:
`codebookSha256`, `ontologySha256`, `missingnessPolicySha256`, `classificationPolicySha256`,
`populationPolicySha256`, `suppressionPolicySha256`. Hash the exact file bytes.

**Canonical semantic digest → sha256** — for code components whose source bytes legitimately
drift (formatting, refactors, file moves) while behaviour stays identical:

- `signalMapSha256` — `sha256(canonicalJson({ axe: AXE_SIGNAL_MAP, ext: EXT_SIGNAL_MAP }))`.
  `canonicalJson` serializes with recursively sorted object keys, so semantically-equal maps
  hash equal regardless of key order or whitespace.
- `scoringSemanticsSha256` — behavioral fingerprint: `sha256(canonicalJson(probeResults))`
  where `probeResults` is `scoreSite` evaluated over `buildScoringProbes(codebook)` — a
  deterministic matrix covering every indicator × rule-variant × missing/conditional state.
  Identical scoring behaviour → identical digest even when the engine source is refactored.

## Why semantic digests for code

Between Q2 (`pipelines-webgogol-4 @ a574593c`) and Q3 the scoring engine was refactored
(`scoring-rules.ts` merged into `score-site.ts`, `types.ts` re-derived from Zod schemas) — the
source bytes differ but the behaviour is identical. A raw-source hash would falsely report a
methodology change; the behavioral fingerprint correctly reports none (428 probes, 0 diffs).

## Reconstructed components

A snapshot rebuilt from recovered content (e.g. Q2, which predates versioned policy files)
sets `provenance: reconstructed-from-preserved-evidence` and hashes codified policy documents
that match what the code actually did — never a digest invented to satisfy the comparator.
