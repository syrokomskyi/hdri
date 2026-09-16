# @syrokomskyi/observatory

> [English Version](README.en.md)

<!-- RFC-0109: Publish immutable release envelopes with resumable replication -->
<!-- RFC-0110: Rebuild HDRI releases independently from preserved evidence -->

Asset-zentriertes longitudinales Observatorium für die Analyse der digitalen Präsenz.

## Current readiness (2026-09-13)

Live collection and publication remain blocked pending verified evidence admission.
Direct exports and promotion apply cannot bypass this gate. Independent rebuild
also stops at admission; its behind-gate reconstruction remains incomplete. The new
offline rehearsal controller verifies real isolated adapter outputs and resume,
but always reports `operationallyQualified: false`. Production adapters and the
1k/10k/50k/200k whole-chain proofs remain open. The operator approved this machine
for offline work; approval is not qualification. See the [factory runbook](../factory/RUNBOOK.md)
and [current review](../../../docs/reviews/code/apps-hdri-observatory/review-2026-09-13-13-19-apps-hdri-observatory.md)
before running commands. Existing descriptions are not an operational certificate.
Original Q2 and existing public data must remain untouched.

The [Q3 preparation update](../../../docs/reviews/code/apps-hdri-observatory/review-2026-09-15-16-15-apps-hdri-observatory.md) records the operator-approved bounded source exclusions and sequential launch work. Methodology comparison now rejects incomplete component identities and wrong-quarter snapshots; matching declared methodology never automatically authorizes panel or population-weighted comparisons. The existing snapshot producer remains incomplete, so this correction is not launch certification.

## Architektur

Vier-Schichten-Datenmodell:

1. **Evidenz** — Roh-HTML, Lighthouse-JSON, axe-JSON (inhaltsadressiert)
2. **Beobachtungen** — Unveränderliche atomare Signale mit Ontologiepfaden und Bitemporalität
3. **Interpretationen** — Versionierte HDRI-Scores, Kohorten, narrative Anker
4. **Narrativ & Visualisierung** — Marts, Berichte, Anomaliealarme

## Pipeline-Phasen

| Phase       | Zweck                                                    |
| ----------- | -------------------------------------------------------- |
| `harvest`   | Asset-Zustände laden, Quelldaten erfassen                |
| `observe`   | Rohsignale auf ontologiegestützte Beobachtungen abbilden |
| `interpret` | Mit HDRI-Codebook bewerten, Kohorten aufbauen            |
| `publish`   | Datenschutzsichere Marts erstellen, Berichte exportieren |

## Verwendung

### Voraussetzungen

Die Digital-Observatory-Pipeline hängt von Upstream-Daten der `factory`-Pipeline ab. Bevor Sie diese Pipeline ausführen, stellen Sie sicher:

1. **factory-Pipelines wurden erfolgreich abgeschlossen**:
   - `0-harvest-source` — erzeugt `core.db` mit Website-Katalog
   - `3-extract-profile` — erzeugt `pages-YYYY-qN.db` mit `ext_*`-Signaltabellen
   - `4-audit-lighthouse` — erzeugt optional `lighthouse-YYYY-qN.db`
   - `5-audit-axe` — erzeugt `axe-YYYY-qN.db` mit Axe-Metriken

2. **Gemeinsame Pakete wurden gebaut**:
   ```bash
   pnpm turbo run build --filter=@syrokomskyi/pipeline-core --filter=@syrokomskyi/pipeline-node --filter=@syrokomskyi/pipeline-steps --filter=@syrokomskyi/observatory-core --filter=@syrokomskyi/hdri-codebook
   ```

**Hinweis:** Das Digital Observatory führt seine eigene HDRI-Bewertung in der `interpret`-Phase durch, unter Verwendung des Codebooks aus `.input/codebook.yaml`. Es verwendet keine vorberechneten Scores aus `factory/a-score-hdri`.

### Schnellstart

1. **Eingabedateien vorbereiten** in `apps/hdri/observatory/.input/`:
   - `brief.md` — Pipeline-Konfiguration (siehe Konfigurationsabschnitt unten)
   - `codebook.yaml` — HDRI-Bewertungscodebook (aus Spec kopieren oder eigenes erstellen)

2. **Die Pipeline ausführen**:

   ```bash
   # Vom Monorepo-Root
   pnpm --filter @syrokomskyi/observatory start
   ```

3. **Ausgabe prüfen** in `apps/hdri/observatory/.output/`:
   - `observatory.db` — SQLite-Datenbank mit Asset-Zuständen, Beobachtungen, Scores
   - Artefakte pro Gogol in `.output/step-*/`

### Konfiguration

Erstellen Sie `.input/brief.md`:

```yaml
---
outputLanguage: de
period: "2025-Q2"
ontologyVersion: "1.0.0"
codebookVersion: "hdri-v1.0.0"
sourceDbDir: "../factory/0-harvest-source/.output"
skipGogols: []
---
```

**Konfigurationsfelder:**

- `outputLanguage` — Sprache für generierte Berichte (z. B. `de`, `en`)
- `period` — Kennung der Analyseperiode (z. B. `2025-Q2`)
- `ontologyVersion` — Zu verwendende Version der Signalontologie (muss mit `signal-ontology-v{X}.json` in observatory-core übereinstimmen)
- `codebookVersion` — Version des HDRI-Codebooks (muss mit `codebook-{version}.yaml` in .input/ übereinstimmen)
- `sourceDbDir` — Pfad zum factory-Ausgabeverzeichnis mit `core.db` (relativ zu .input/)
- `skipGogols` — Array von Gogol-IDs, die während der Ausführung übersprungen werden sollen (z. B. `["export-mart"]`)

### Datenabdeckung und Erreichbarkeitsfilterung

Das Digital Observatory erhält nur Beobachtungen für Websites, die zum Zeitpunkt des Crawlens **live** (HTTP-reaktiv) waren. Die Filterung erfolgt Upstream:

1. **`0-harvest-source`** erfasst alle Websites aus Quellkatalogen
2. **`1-register-businesses`** dedupliziert Domänen
3. **`2-check-liveness`** prüft HTTP-Erreichbarkeit; markiert `is_live=false` für tote Websites
4. **`3-extract-profile`** crawlt nur `is_live=true`-Websites; tote Websites gelangen nie in `pages_*.db`
5. **`a-contract-ontology`** liest nur aus `pages_*.db` — tote Websites sind unsichtbar

Ab Ontologie 2.0 werden quartalsweise `availability.website.*`-Beobachtungen veröffentlicht. `blocked` und `indeterminate` gelten nicht als Ausfall. `website_became_unavailable` darf nur für eine zuvor erreichbare Website entstehen; ein nie erreichbarer Quellenkandidat bleibt im Forschungsarchiv, wird aber nicht als „gestorben“ bezeichnet. Diese Website-Ereignisse sind ausdrücklich keine Aussage über die Schließung eines Unternehmens.

### Eingabedatenquellen

Die Pipeline liest aus drei Upstream-Datenbanken (nur lesend, keine Modifikation):

1. **core.db** (aus `sourceDbDir`):
   - Tabelle `sites` — Website-Katalog mit gewerk_group, bundesland
   - Wird verwendet, um Asset-Zustände zu generieren und Website-Metadaten zu verfolgen

2. **pages-YYYY-qN.db** (aus dem versiegelten Factory-Quartal):
   - Tabelle `page_observations` — Crawl-Log mit content_sha256
   - `ext_*`-Tabellen (42 Tabellen) — Signalextraktionen (Telefon, E-Mail, schema.org usw.)
   - Wird verwendet, um Rohsignale auf ontologiegestützte Beobachtungen abzubilden

3. **audits_YYYY.db** (aus `sourceDbDir/../4-audit-lighthouse/.output/` oder `sourceDbDir/../5-audit-axe/.output/`):
   - Tabelle `lighthouse_runs` — Lighthouse-Leistungsmetriken
   - Tabelle `axe_runs` — axe-Barrierefreiheitsverletzungszählungen
   - Wird verwendet, um technische Leistung und Barrierefreiheit zu bewerten

### Ausgabe

**Datenbank:** `apps/hdri/observatory/.output/observatory.db`

- `pipeline_runs` — Ausführungslog mit Zeitstempeln und Metadaten
- `asset_states` — SCD-2-Verfolgung von Website-Asset-Zuständen über Zeit
- `observations` — Ontologiegestützte Beobachtungen mit Bitemporalität

**Artefakte:** `apps/hdri/observatory/.output/step-{gogol-id}/`

- Pro-Gogol-JSON-Berichte, Kohortendefinitionen, Mart-Exporte

### HDRI-Dashboard nach Codebook-Änderungen neu generieren

Die `dashboard`-Astro-App verbraucht aggregierte JSON-Daten, die aus der Observatoriumsdatenbank exportiert wurden. Die Änderung von `codebook.yaml` aktualisiert das Dashboard nicht automatisch — Sie müssen die Bewertungsphase und den Export-Schritt erneut ausführen.

**Schritt für Schritt:**

1. **Führen Sie die Digital-Observatory-Pipeline erneut aus**, damit `ScoreHdriGogol` `.input/codebook.yaml` erneut liest und aktualisierte Scores in `observatory.db` schreibt:

   ```bash
   pnpm --filter @syrokomskyi/observatory start
   ```

2. **Exportieren Sie das Dashboard-Archiv** aus der aktualisierten Datenbank:

   ```bash
   pnpm --filter @syrokomskyi/observatory run export:dashboard
   ```

   Dies schreibt öffentliche JSON-Payloads in `apps/hdri/dashboard/src/assets/data/`.

3. **Bauen Sie das Astro-Dashboard**:
   ```bash
   pnpm --filter @syrokomskyi/dashboard run build
   ```

**Warum das erforderlich ist:** Das Dashboard liest nur _veröffentlichte_ (`status = 'published'`) Läufe aus `observatory.db`. Das Codebook wird zum Bewertungszeitpunkt (`interpret`-Phase) geladen, daher muss jede Gewichts- oder Regeländerung durchlaufen: `codebook.yaml` → `ScoreHdriGogol` → `observatory.db` → `export-dashboard-archive.ts` → `dashboard/dist/`.

## Veröffentlichung

Aggregierte, anonymisierte Quartalsdaten werden auf **[handwerk-index.de](https://handwerk-index.de)** veröffentlicht. Die vollständige Methodik des Index findet sich in [`METHODOLOGY.md`](../METHODOLOGY.md).

### K-Anonymität-Politik

Die K-Anonymität-Schwelle wird nicht mehr im Code hartcodiert, sondern aus einer YAML-Policy-Datei geladen:

- **Datei:** `policies/k-anon-policy-v{N}.yaml` (die höchste Versionsnummer wird automatisch ausgewählt)
- **Felder:** `default_k`, `hard_floor`, `high_risk_release`
- **Auflösung:** `effective_k_min = default_k`, ausser `default_k < hard_floor` und `high_risk_release` ist `false` — dann gilt `hard_floor`
- **Aktuelle Policy:** `default_k: 12`, `hard_floor: 5`, `high_risk_release: false` → `effective_k_min = 12`

Alle Export-Tools (`export-dashboard-data`, `export-dashboard-archive`, `ExportMartGogol`) laden die Policy zur Laufzeit via `loadKAnonPolicy()` aus `tools/k-anon-policy.ts`.

## Abhängigkeiten

- `@syrokomskyi/observatory-core` — Typen, Ontologie, Validierung, Hashing
- `@syrokomskyi/hdri-codebook` — HDRI (Handwerk Digital Readiness Index) Bewertungsengine
- `@syrokomskyi/pipeline-core`, `@syrokomskyi/pipeline-node`, `@syrokomskyi/pipeline-steps` — Gemeinsame Pipeline-Engine

## Changelog

[CHANGELOG.md](CHANGELOG.md)

## Preservation und Baseline-Import (RFC-0100)

Der Kopiermechanismus bewahrt Q2-Originalbytes und getrennte SQLite-Snapshots in vollständigen signierten Kopien. Eine operative Sicherung ist damit noch nicht nachgewiesen. Die Baseline-Konversion bleibt bis zur Korrektur der Identitätszuordnung und des Wertevergleichs gesperrt.

The device-scoped identity validator and exact streaming record comparator now have
real SQLite regression coverage, including same-count value changes and preserved
WAL snapshots. They are building blocks, not the completed converter: archive-bound
schema mapping, imported-evidence provenance and final receipt wiring remain open.
See the [conversion boundary](RUNBOOK.md#baseline-comparison-building-blocks-a1-partial).

Archive input preparation now authenticates all declared copies and creates a
fresh, fully reread working copy without opening retained databases. It checks
standalone snapshot coverage and rejects changed or unexpected bytes. This is an
internal converter building block, not a new command or completed Q2 import.
See [verified input preparation](RUNBOOK.md#verified-baseline-input-preparation-a1-partial).

The baseline scope diagnostic now accounts for every prepared snapshot and table.
Its separate historical-signature diagnostic verifies the Q2 token and original
main-file hash only against a caller-supplied key map. It explicitly leaves key-map
authority, unsigned producer metadata and the WAL/snapshot generation unproven, so
neither result admits an import. See
[baseline provenance limits](RUNBOOK.md#baseline-scope-and-historical-signature-diagnostics-a1-partial).

The signed-row diagnostic now rejects substituted observation IDs and conflicting
or partial signing metadata embedded in retained JSON. It preserves original bytes
and bounds retained failure messages. A successful signature check still does not
prove quarterly completeness, all SQL/JSON field agreement, or historical signing
time/device provenance. See [signature verification limits](RUNBOOK.md#5-verify-vault-signatures).

The observation source reader now consumes only process-local verified preparation
objects. It limits row transfer before JavaScript allocation, rejects SQL/JSON
contradictions and preserves original payload bytes. This covers the known
observation table, not complete source provenance, current-format materialization
or an operational import. See [bounded observation reading](RUNBOOK.md#bounded-observation-source-reader-a1-partial).

The identity-joined reader additionally resolves each observation against the same
pinned snapshot's retained ID map. It requires an explicit provisional/canonical
namespace, preserves source JSON and UUID spelling, and returns snapshot-bound row
locators. Missing mappings fail instead of silently reassigning a site. This does
not establish factory/device provenance or full identity-domain coverage.
See [retained identity joins](RUNBOOK.md#snapshot-bound-observation-identity-joins-a1-partial).

### Befehle

| Befehl | Zweck |
| --- | --- |
| `preserve:q2` | Explizite `--inventory` und `--destinations` verarbeiten; Originale und Snapshots signiert sichern. `--dry-run` schreibt nichts. |
| `preserve:verify` | Alle Dateien prüfen; `--destinations`, `--manifest-sha256`, `--verification-key` und `--key-id` sind erforderlich. |
| `baseline:import` | Vor jedem Dateizugriff gesperrt: `BASELINE_CONVERSION_UNVERIFIED`. |

### Fehlermodi

Fehler liefern Exit-Code 1 ohne Erfolgsnachweis; unvollständige Zielverzeichnisse bleiben zur Diagnose erhalten und werden nicht überschrieben. Exit-Code 0 mit `planned` bedeutet nur Diagnose, mit `pass` nur erfolgreiche Kopierprüfung — keine operative Zulassung. Physische Unabhängigkeit, Kapazität und stillgelegte Quell-Writer müssen gesondert belegt werden. Formate und Grenzen: [Runbook](RUNBOOK.md#q2-preservation-boundary).

## Scientific admission contract (RFC-0107)

Scientific admission consumes typed manifest-bound products and independently gates coverage, methodology, panel comparability, classification and population weighting. The `quarter:validate` interface accepts `--input-manifest <scientific-inputs.json> --report-root <new-revision-root> --json` instead of ad-hoc guessed paths. Reconciliation uses set-based checks (not count equality), methodology identity is content-based (not version-string), and population-frame provenance uses parsed exact hostname matching (not substring). Classification QC thresholds are loaded from `policies/classification-qc-policy-v1.yaml`.

## Public product boundary contract (RFC-0108)

Private HDRI marts (asset-level identifiers, domains, remediation) are separated from verified public products generated by an allowlisted aggregate schema.

### Key contracts

- `PublicProductRef` — typed reference with content hash, policy hash, and source aggregate hash for each public product.
- `DisclosureReport` — privacy review report with files checked, cells checked, effective k, and violations.
- `PUBLIC_PRODUCT_SCHEMAS` — registry mapping product types to allowed and prohibited fields.

### Changed interfaces

- `publicMode` field removed from `Brief` and `ExportMartGogol`. ExportMartGogol is now private-only with full identifiers.
- New `ExportPublicProductsGogol` consumes eligible aggregates and emits typed `PublicProductRef` entries with allowlisted dimensions only.
- `privacy-review.ts` accepts `--public-manifest <path>` and reads actual file bytes (CSV and JSON), not just JSON cells arrays.
- `PrepareQuarterReleaseGogol` admits only `PublicProductRef` entries from the public manifest as publication artifacts.
- Dashboard export currently fails closed before writes. Manifest-only consumption is not yet connected; RFC-0115 proposes the replacement.
