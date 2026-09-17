# Q2 → Q3 Methodology-Change Record

Comparison: `compareMethodologySnapshots(2026-q2, 2026-q3)` Result: **`scoreComparable: false`** — `changedComponents: [classificationPolicySha256, suppressionPolicySha256]`

This is the honest result. Six of eight methodology components are byte/behaviour-identical; two admission policies genuinely changed between the Q2 emit (2026-05-27, `pipelines-webgogol-4 @ a574593c`) and the current Q3 methodology. No digest was fabricated or forced.

## Matching components (identical)

| Component | Digest | Basis |
| --- | --- | --- |
| `codebookSha256` | `2185cb17…` | capsule-preserved `codebook.yaml` v1.3.0, byte-identical |
| `ontologySha256` | `3f392776…` | recovered `ontology.yaml` v1.0.0, byte-identical |
| `signalMapSha256` | `4dcbbd97…` | canonical JSON of `EXT_SIGNAL_MAP`+`AXE_SIGNAL_MAP`; identical data |
| `scoringSemanticsSha256` | `6004be41…` | behavioral fingerprint — `scoreSite` over a 428-probe matrix, 0 output diffs |
| `missingnessPolicySha256` | `d7d83c47…` | shared `missingness-policy-v1.yaml` (same codebook `missing:` + same logic) |
| `populationPolicySha256` | `157b27c1…` | shared `population-policy-v1.yaml` (same Destatis 16×7 frame) |

## Changed components (the methodology break)

### `suppressionPolicySha256` — k-anonymity threshold raised

- **Q2** `00ee87b7…`: flat `K_ANONYMITY_MIN = 5` hardcoded (`ExportMartGogol.ts:38`). Groups with `n ≥ 5` published.
- **Q3** `e7e87a3f…`: `k-anon-policy-v1.yaml` → `default_k: 12`, `hard_floor: 5` → `effective_k_min = 12`.
- **Effect:** a cohort of size 5–11 published in Q2 is suppressed in Q3. Stricter privacy floor.

### `classificationPolicySha256` — classification QC gate added

- **Q2** `641326aa…`: no classification QC sampling existed (reconstructed `qc: none`).
- **Q3** `c7eaeb12…`: `classification-qc-policy-v1.yaml` → `maxSamplePerCell: 100`, `minimumWilsonLowerBound: 0.90`, suppresses products on missing/failed strata labels.
- **Effect:** a new admission gate that did not exist in Q2.

## Interpretation

The **scoring methodology is unchanged** — the same asset produces the same score in both quarters (codebook, ontology, signal map, scoring semantics, missingness, population frame all identical). What changed is the **product-admission boundary**: which aggregates survive suppression and classification QC. Because `scoreComparable` requires all eight declared components to match, the honest verdict is `false`, and direct score deltas are correctly suppressed (`direct_score_delta_suppressed_methodology_unverified_or_changed`).

## Provenance

- Q2 snapshot `provenance: reconstructed-from-preserved-evidence`. Codebook/ontology are capsule/git-preserved bytes; signal map + scoring semantics digests were verified against the recovered Q2 engine (`pipelines-webgogol-4 @ a574593c`) producing identical values; the four policy digests hash codified documents — shared where behaviour is identical, reconstructed (`suppression-policy.yaml`, `classification-policy.yaml`) where Q2 ran with implicit policy.

## Decision (2026-09-17)

**Accepted: keep Q3's stricter admission policies; `scoreComparable: false` stands.**

The k=5→12 raise (commit `1da427396`) and the classification-QC gate are deliberate RFC-0107 improvements. Reverting them for Q2-parity would weaken privacy and drop a QC gate — not worth it purely to make the comparator report `true`. The scoring methodology is identical, so the break is in the _admission boundary_, not the scores. Direct Q2↔Q3 score deltas stay suppressed; the change is documented here and surfaced via `changedComponents`.

Alternatives considered and rejected:

- _Narrow `scoreComparable` scope_ — would require a comparator-contract RFC; the current contract intentionally treats admission policy as part of methodology identity.
- _Align Q3 to Q2 (k=5, no QC)_ — rejected: forfeits the privacy hardening and QC gate.

## Installation

The reconstructed Q2 snapshot is installed at `.output/vault/releases/period=2026-q2/methodology-snapshot.json` so `ValidateQuarterGogol` (`--q2-snapshot <vaultDir>/releases/period=2026-q2/methodology-snapshot.json`) finds it during the Q3 build and produces this honest `false` rather than a missing-snapshot violation.
