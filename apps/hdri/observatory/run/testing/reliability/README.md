# HDRI Reliability Test Corpus (ADR-0024)

## ADR-0024

This directory owns the **deterministic offline HDRI acceptance corpus** — a
versioned set of synthetic test fixtures with hashed content, immutable
synthetic identities, and production-path boundary adapters.

The corpus provides repeatable examples for new sessions without committing
private historical pages or depending on changing public websites.

## Limits

The corpus **cannot** prove:

- **Live-source representativeness** — synthetic HTML reproduces structural
  shapes, not real-world variability.
- **Production hardware performance** — fixtures run in-process with injected
  transport, not on real infrastructure.
- **Real preservation** — replica independence and signed evidence require
  actual external verification, not fixture stand-ins.
- **Human labels** — editorial quality and factual correctness require human
  review, not synthetic expected outcomes.
- **Full-size measurements** — the tiny corpus uses at least one example per
  case; full qualification states exact weights and counts separately.

No mock or generated success receipt may stand in for real external evidence
required by a production gate.

## Corpus structure

- **Manifest schema**: `hdri-fixture-corpus@1`
- **Seed**: Fixed string controlling all synthetic IDs, content hashes, and
  weights deterministically.
- **Fixtures**: One per case from the ADR-0024 decision table (10 groups, 50+
  cases).
- **Paths**: All fixture paths are repository-relative under
  `testing/reliability/fixtures/`. No fixture may reference `.input/batches/`
  (Q2 data), `.output/db/` (production databases), `.output/frames/`
  (production frames), or `.env` files.

## Case groups

| Group | Purpose |
| --- | --- |
| source-shape | All four audited source families, nested directories, external origins, HTML/MHTML |
| historical-identity | Numeric-ID generations, canonical maps, ambiguous owners, unknown times |
| endpoint | HTTP-only, www-only, redirects, HEAD 405, 429/503, transient DNS |
| content | Shared HTML, charset issues, truncated/oversized bodies, missing CAS |
| browser | Error pages, failed preflight, stalls, leaked context state |
| execution | Clock rollback, equal times, stale leases, duplicate attempts, interruptions |
| release | Report schemas, entity counts, replica aliases, missing receipts, retry |
| privacy | Direct identifiers, JSON arrays, small cells, suppression, changed bytes |
| recovery | Forbidden access, missing dependencies, corrupted objects, key rotation |
| continuity | Q4→Q1, delayed publication, incomplete predecessors, gaps, idempotent init |

## Evolution

Add a minimal deterministic fixture for each new escaped defect before fixing
it. Change the corpus version/digest when cases or weights change; old
qualification receipts then become stale.

Revisit the organization if fixtures require production package dependencies or
app-to-app imports: keep corpus data local and reuse shared libraries instead.
