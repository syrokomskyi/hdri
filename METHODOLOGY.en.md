# HDRI Methodology

> [Deutsche Version](METHODOLOGY.md)

This document describes the scientific and technical methodology of the **Handwerk Digital Readiness Index (HDRI)**. It is intended for researchers, policy analysts, and auditors who need to understand how the index is constructed before using it for studies or reports.

The implemented methodology is fully encoded in [`codebook.yaml`](apps/digital-observatory/.input/codebook.yaml) (scoring rules) and [`ontology.yaml`](apps/digital-observatory/.input/ontology.yaml) (signal catalog). This document is the human-readable summary.

---

## 1. What is "digital readiness" in the HDRI context?

**Digital readiness** refers to the ability of a craft business to shape its online presence so that it is legally compliant, contactable, discoverable through structured data, trustworthy, and accessible. The HDRI does **not** measure internal IT processes (ERP, CAD, accounting software); it measures **only** the publicly visible digital presence.

The index dimensions are based on:
- **EU Digital Economy and Society Index (DESI)** — general benchmarks for digital infrastructure
- **Google Page Experience** — technical performance and accessibility standards
- **German and EU law** — §5 TMG, Art. 13/14 GDPR, Barrierefreiheitsstärkungsgesetz (BFSG)

---

## 2. Authoritative sources

The classification of craft businesses follows official law exclusively:

- **Anlage A and Anlage B of the Handwerksordnung (HWO)** — the statutory lists of licensed and unlicensed crafts in Germany. Source: [`Gesetze im Internet`](https://www.gesetze-im-internet.de/hwo/anlage_a.html) and [`Anlage B`](https://www.gesetze-im-internet.de/hwo/anlage_b.html). These data are versioned as machine-readable JSON in [`packages/business-core/src/gewerk/data/hwo-master.json`](packages/business-core/src/gewerk/data/hwo-master.json).

- **Destatis business groups I–VII** — the Federal Statistical Office (Destatis) maps HWO crafts into seven business groups. The mapping is documented in [`packages/business-core/src/gewerk/data/destatis-mapping.json`](packages/business-core/src/gewerk/data/destatis-mapping.json) and is based on the publication *„Gewerbegruppen der Handwerksstatistiken nach Handwerksordnung Stand 2021"*.

By anchoring classification in federal law and official statistics, the taxonomy is reproducible and traceable for research institutions (ZEW, Fraunhofer IAO, universities).

---

## 3. Signals and ontology

A **signal** is an observable property of a website captured by an automated extractor (crawler, DOM analyser, Lighthouse, axe). The complete list of signals lives in [`ontology.yaml`](apps/digital-observatory/.input/ontology.yaml).

| Signal category | Examples | Source |
|---|---|---|
| `legal.*` | Impressum, privacy policy, terms, BFSG statement | Homepage crawl + rule matching (§5 TMG, Art. 13/14 GDPR, BFSG) |
| `contact.*` | Phone, email, contact form, opening hours | DOM extraction (schema.org, microdata) |
| `structured_data.*` | schema.org types (LocalBusiness, Service, FAQ) | JSON-LD / microdata parser |
| `trust.*` | Certifications, awards, memberships | DOM extraction |
| `social.*` | Xing, Pinterest, Twitter, Facebook | DOM extraction |
| `accessibility.*` | axe violations, Lighthouse accessibility score | axe-core, Lighthouse |
| `content.*` | Portfolio, team page, testimonials | DOM extraction |
| `privacy.consent.*` | Cookie banner quality | DOM-CSS analysis |

Each signal has:
- `value_type` (`bool`, `str`, `int`, `float`)
- `stability` (`high` / `medium` / `low`) — how reliable the extractor is
- `extractor` — version of the extractor used (e.g. `rule_v3`, `dom_css_v2`)
- `notes` — legal basis or limitation

---

## 4. Index construction

### 4.1 Dimensions and weights

The HDRI is a **weighted arithmetic mean** across 6 dimensions. Each `indicator` weight is multiplied by its parent `dimension` weight.

| Dimension | Weight | Rationale |
|---|---|---|
| **Legal compliance** (`legal_compliance`) | 28 % | Highest risk when absent (§5 TMG, GDPR, BFSG). |
| **Contactability** (`contact`) | 22 % | Direct conversion layer for customers. |
| **Structured data** (`structured_data`) | 18 % | Visibility in search engines and AI-driven answer systems. |
| **Accessibility** (`accessibility`) | 16 % | BFSG mandate from 28.06.2025 for e-commerce; social inclusion. |
| **Trust signals** (`trust`) | 12 % | Quality indicators influencing purchase decisions. |
| **Social media** (`social`) | 4 % | Reach, but only a supplementary factor for pure craft businesses. |

The implemented rules are in [`codebook.yaml`](apps/digital-observatory/.input/codebook.yaml) under `dimensions`.

### 4.2 Scaling

Every indicator is mapped to a **0–100 scale**:
- `bool` rules: `true → 100`, `false → 0`
- `numeric` rules: linear between `minScore` and `maxScore`
- `inverse_count` rules: the fewer violations (axe), the higher the score

### 4.3 Handling missing values

Not all websites provide all signals. The codebook defines **conditional missing states**:

| State | Meaning | Impact on score |
|---|---|---|
| `absent` | Signal does not exist on the page | `zero` → 0 points |
| `unreachable` | Page was unreachable (timeout, 5xx) | `exclude` → removed from the mean |
| `forbidden` | Access blocked (403, bot detection) | `exclude` → removed from the mean |

This prevents dead or blocked pages from artificially lowering the average.

### 4.4 Domain-level aggregation

If a domain has multiple crawled pages (e.g. homepage + imprint), the **maximum operator** is applied across all pages: if the imprint exists on *any* crawled page, the domain is counted as positive.

### 4.5 Stratified sampling

Reporting is not limited to the overall mean; it is broken down by **strata** `(gewerk_group × bundesland)`. Within each stratum, a deterministic random draw with seeded RNG (FNV-1a → mulberry32) is performed. This makes repeated runs reproducible.

Implementation details: [`apps/hdri-factory/AGENTS.md`](apps/hdri-factory/AGENTS.md).

---

## 5. Privacy and k-anonymity

Before any results are published, a **k-anonymity check** is performed:
- `k_min = 5` — every stratum must contain at least 5 domains
- Default mode: `enforce` (pipeline aborts if any stratum is too small)
- Override to `warn` for development only

Identifying data (domain, craft, state, real `site_id`) is removed in `public` mode. In `internal` mode it is retained for internal analysis.

---

## 6. Data quality and limitations

### 6.1 Liveness bias

Only reachable (`is_live=true`) pages are crawled and scored. Pages that fail the liveness check do not appear in any evaluation. This means the index **underestimates the digital readiness of the least digitised businesses**, since these often have no website at all.

### 6.2 Extractor confidence

Every extractor carries a version number (`rule_v3`, `dom_css_v2`). When rules are upgraded, historical data are not retroactively recalculated; this leads to incremental improvements over time. Versioning allows researchers to trace the accuracy of each measurement.

### 6.3 Periodicity

The index is computed **quarterly**. The period label follows the pattern `YYYY-Qn` (e.g. `2026-Q2`). All SQLite databases carry the year as a suffix (`core_2026.db`, `pages_2026.db`).

---

## 7. Publication and reuse

Aggregated, anonymised quarterly data are published on **[handwerk-index.de](https://handwerk-index.de)**. The website is a static Astro dashboard built from [`apps/hdri-dashboard`](apps/hdri-dashboard). The dashboard source code is available under the [Apache License 2.0](LICENSE).

---

## 8. Versioning and reproducibility

- **Codebook** — versioned in `codebook.yaml` (currently v1.3.0). Any weight or rule change requires a new codebook version.
- **Ontology** — versioned in `ontology.yaml` (currently v1.0.0). New signals receive an `introduced_in` date.
- **Databases** — Each quarter produces new `*_YYYY.db` files; historical data are never overwritten.
- **Reproducibility** — Through deterministic asset-ID derivation (SHA-256 over domain + `sourceToken`) and seeded sampling, identical samples can be reproduced across runs.

---

## 9. Academic references

| Source | Relevance to HDRI |
|---|---|
| [EU Digital Economy and Society Index (DESI)](https://digital-strategy.ec.europa.eu/en/policies/desi) | Benchmark for digital infrastructure and public services |
| [OECD Digital Government Index](https://www.oecd.org/gov/digital-government-index.htm) | Framework for assessing digital maturity of organisations |
| [Google Page Experience](https://developers.google.com/search/docs/appearance/page-experience) | Technical performance metrics (Largest Contentful Paint, CLS) |
| §5 TMG (Telemediengesetz) | Legal basis for imprint obligation |
| Art. 13/14 GDPR | Legal basis for privacy policy |
| Barrierefreiheitsstärkungsgesetz (BFSG) | Legal basis for accessibility statement (from 28.06.2025) |
| [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) and [EN 301 549](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/) | Technical standards for web accessibility |
| [Destatis — Gewerbegruppen der Handwerksstatistiken](https://www.destatis.de) | Official craft classification into groups I–VII |
| [Handwerksordnung (HWO) — Anlage A/B](https://www.gesetze-im-internet.de/hwo/) | Legal basis for craft classification |

---

> This methodology is updated with every codebook version. The latest revision corresponds to **Codebook v1.3.0** / **Ontology v1.0.0**.
