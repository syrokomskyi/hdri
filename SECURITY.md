# Security and privacy

This document describes how the Handwerk Digital Readiness Index (HDRI) handles data, identifiers, and privacy.

## What we do not collect

- **No personal data.** HDRI does not collect names, e-mail addresses, phone numbers, or any information that directly identifies a natural person.
- **No IP logging.** Web requests made during audits do not store client or server IP addresses.
- **No individual business names in public outputs.** Company names extracted from source catalogs are used only for internal deduplication and scoring. They are never published in the public dashboard or in open data releases.

## How identifiers are handled

- Business identifiers (e.g. domain names) are **pseudonymised** inside the pipeline. Deterministic hashes are used where a stable internal reference is required.
- The public dashboard and all published data marts contain **only aggregated scores** (by region, trade group, or cohort). Individual businesses cannot be singled out.
- Raw observation bundles are signed for integrity, but the signing keys and internal identifiers remain inside the repository and are not exposed.

## What is published

- Aggregated, anonymised quarterly data on [handwerk-index.de](https://handwerk-index.de).
- The open codebook (weights, thresholds, signal definitions) in [`packages/hdri-codebook`](packages/hdri-codebook).
- Source code and pipeline logic under the [Apache License 2.0](LICENSE).

## GDPR orientation

The project strives to be compatible with GDPR principles, in particular:

- **Data minimisation** — only the signals strictly needed for scoring are extracted.
- **Privacy by design** — aggregation and pseudonymisation happen before any data reaches the public layer.
- **Purpose limitation** — data collected for digital-readiness scoring is not reused for unrelated purposes.
- **Transparency** — every processing step is version-controlled and auditable.

This is a research and civic-technology initiative, not a commercial data broker. We do not claim legal GDPR compliance on behalf of third parties that may reuse the code or data.

## Reporting a security concern

If you discover a vulnerability or a privacy leak in the code, pipeline, or published outputs, please:

1. Open a private GitHub security advisory, or
2. Contact the Project Lead via the channels listed in [CONTACT.md](CONTACT.md).

We will acknowledge receipt within 48 hours and aim to provide an initial assessment within 7 days.
