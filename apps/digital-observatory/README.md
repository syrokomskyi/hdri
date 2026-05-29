# @org/digital-observatory

> [English Version](README.en.md)

Asset-zentriertes longitudinales Observatorium für die Analyse der digitalen Präsenz.

## Architektur

Vier-Schichten-Datenmodell:

1. **Evidenz** — Roh-HTML, Lighthouse-JSON, axe-JSON (inhaltsadressiert)
2. **Beobachtungen** — Unveränderliche atomare Signale mit Ontologiepfaden und Bitemporalität
3. **Interpretationen** — Versionierte HDRI-Scores, Kohorten, narrative Anker
4. **Narrativ & Visualisierung** — Marts, Berichte, Anomaliealarme

## Pipeline-Phasen

| Phase | Zweck |
|---|---|
| `harvest` | Asset-Zustände laden, Quelldaten erfassen |
| `observe` | Rohsignale auf ontologiegestützte Beobachtungen abbilden |
| `interpret` | Mit HDRI-Codebook bewerten, Kohorten aufbauen |
| `publish` | Datenschutzsichere Marts erstellen, Berichte exportieren |

## Verwendung

### Voraussetzungen

Die Digital-Observatory-Pipeline hängt von Upstream-Daten der `hdri-factory`-Pipeline ab. Bevor Sie diese Pipeline ausführen, stellen Sie sicher:

1. **hdri-factory-Pipelines wurden erfolgreich abgeschlossen**:
   - `0-harvest-source` — erzeugt `core.db` mit Website-Katalog
   - `3-extract-profile` — erzeugt `pages_YYYY.db` mit `ext_*`-Signaltabellen
   - `4-audit-lighthouse` — erzeugt `lighthouse_YYYY.db` mit Lighthouse-Metriken
   - `5-audit-axe` — erzeugt `axe_YYYY.db` mit Axe-Metriken

2. **Gemeinsame Pakete wurden gebaut**:
   ```bash
   pnpm turbo run build --filter=@org/pipeline-core --filter=@org/pipeline-node --filter=@org/pipeline-steps --filter=@org/observatory-core --filter=@org/hdri-codebook
   ```

**Hinweis:** Das Digital Observatory führt seine eigene HDRI-Bewertung in der `interpret`-Phase durch, unter Verwendung des Codebooks aus `.input/codebook.yaml`. Es verwendet keine vorberechneten Scores aus `hdri-factory/a-score-hdri`.

### Schnellstart

1. **Eingabedateien vorbereiten** in `apps/digital-observatory/.input/`:
   - `brief.md` — Pipeline-Konfiguration (siehe Konfigurationsabschnitt unten)
   - `codebook.yaml` — HDRI-Bewertungscodebook (aus Spec kopieren oder eigenes erstellen)

2. **Die Pipeline ausführen**:
   ```bash
   # Vom Monorepo-Root
   pnpm --filter @org/digital-observatory start
   ```

3. **Ausgabe prüfen** in `apps/digital-observatory/.output/`:
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
sourceDbDir: "../hdri-factory/0-harvest-source/.output"
publicMode: false
skipGogols: []
---
```

**Konfigurationsfelder:**
- `outputLanguage` — Sprache für generierte Berichte (z. B. `de`, `en`)
- `period` — Kennung der Analyseperiode (z. B. `2025-Q2`)
- `ontologyVersion` — Zu verwendende Version der Signalontologie (muss mit `signal-ontology-v{X}.json` in observatory-core übereinstimmen)
- `codebookVersion` — Version des HDRI-Codebooks (muss mit `codebook-{version}.yaml` in .input/ übereinstimmen)
- `sourceDbDir` — Pfad zum hdri-factory-Ausgabeverzeichnis mit `core.db` (relativ zu .input/)
- `publicMode` — Bei `true` werden strengere Datenschutzkontrollen für die öffentliche Veröffentlichung angewendet
- `skipGogols` — Array von Gogol-IDs, die während der Ausführung übersprungen werden sollen (z. B. `["export-mart"]`)

### Datenabdeckung und Erreichbarkeitsfilterung

Das Digital Observatory erhält nur Beobachtungen für Websites, die zum Zeitpunkt des Crawlens **live** (HTTP-reaktiv) waren. Die Filterung erfolgt Upstream:

1. **`0-harvest-source`** erfasst alle Websites aus Quellkatalogen
2. **`1-register-businesses`** dedupliziert Domänen
3. **`2-check-liveness`** prüft HTTP-Erreichbarkeit; markiert `is_live=false` für tote Websites
4. **`3-extract-profile`** crawlt nur `is_live=true`-Websites; tote Websites gelangen nie in `pages_*.db`
5. **`a-contract-ontology`** liest nur aus `pages_*.db` — tote Websites sind unsichtbar

**Konsequenz:** Das Observatorium hat kein explizites Wissen über tote oder unerreichbare Websites. Eine Website, die in der ursprünglichen Ernte vorhanden war, aber die Erreichbarkeitsprüfungen nicht bestanden hat, fehlt einfach in allen Beobachtungen. Derzeit gibt es kein `availability.is_live`-Signal in der Ontologie.

### Eingabedatenquellen

Die Pipeline liest aus drei Upstream-Datenbanken (nur lesend, keine Modifikation):

1. **core.db** (aus `sourceDbDir`):
   - Tabelle `sites` — Website-Katalog mit gewerk_group, bundesland
   - Wird verwendet, um Asset-Zustände zu generieren und Website-Metadaten zu verfolgen

2. **pages_YYYY.db** (aus `sourceDbDir/../3-extract-profile/.output/`):
   - Tabelle `page_observations` — Crawl-Log mit content_sha256
   - `ext_*`-Tabellen (42 Tabellen) — Signalextraktionen (Telefon, E-Mail, schema.org usw.)
   - Wird verwendet, um Rohsignale auf ontologiegestützte Beobachtungen abzubilden

3. **audits_YYYY.db** (aus `sourceDbDir/../4-audit-lighthouse/.output/` oder `sourceDbDir/../5-audit-axe/.output/`):
   - Tabelle `lighthouse_runs` — Lighthouse-Leistungsmetriken
   - Tabelle `axe_runs` — axe-Barrierefreiheitsverletzungszählungen
   - Wird verwendet, um technische Leistung und Barrierefreiheit zu bewerten

### Ausgabe

**Datenbank:** `apps/digital-observatory/.output/observatory.db`
- `pipeline_runs` — Ausführungslog mit Zeitstempeln und Metadaten
- `asset_states` — SCD-2-Verfolgung von Website-Asset-Zuständen über Zeit
- `observations` — Ontologiegestützte Beobachtungen mit Bitemporalität

**Artefakte:** `apps/digital-observatory/.output/step-{gogol-id}/`
- Pro-Gogol-JSON-Berichte, Kohortendefinitionen, Mart-Exporte

### HDRI-Dashboard nach Codebook-Änderungen neu generieren

Die `hdri-dashboard`-Astro-App verbraucht aggregierte JSON-Daten, die aus der Observatoriumsdatenbank exportiert wurden. Die Änderung von `codebook.yaml` aktualisiert das Dashboard nicht automatisch — Sie müssen die Bewertungsphase und den Export-Schritt erneut ausführen.

**Schritt für Schritt:**

1. **Führen Sie die Digital-Observatory-Pipeline erneut aus**, damit `ScoreHdriGogol` `.input/codebook.yaml` erneut liest und aktualisierte Scores in `observatory.db` schreibt:
   ```bash
   pnpm --filter @org/digital-observatory start
   ```

2. **Exportieren Sie das Dashboard-Archiv** aus der aktualisierten Datenbank:
   ```bash
   pnpm --filter @org/digital-observatory run export:dashboard
   ```
   Dies schreibt öffentliche JSON-Payloads in `apps/hdri-dashboard/src/assets/data/`.

3. **Bauen Sie das Astro-Dashboard**:
   ```bash
   pnpm --filter @org/hdri-dashboard run build
   ```

**Warum das erforderlich ist:** Das Dashboard liest nur *veröffentlichte* (`status = 'published'`) Läufe aus `observatory.db`. Das Codebook wird zum Bewertungszeitpunkt (`interpret`-Phase) geladen, daher muss jede Gewichts- oder Regeländerung durchlaufen: `codebook.yaml` → `ScoreHdriGogol` → `observatory.db` → `export-hdri-dashboard-archive.ts` → `hdri-dashboard/dist/`.

## Veröffentlichung

Aggregierte, anonymisierte Quartalsdaten werden auf **[handwerk-index.de](https://handwerk-index.de)** veröffentlicht. Die vollständige Methodik des Index findet sich in [`METHODOLOGY.md`](../../METHODOLOGY.md).

## Abhängigkeiten

- `@org/observatory-core` — Typen, Ontologie, Validierung, Hashing
- `@org/hdri-codebook` — HDRI (Handwerk Digital Readiness Index) Bewertungsengine
- `@org/pipeline-core`, `@org/pipeline-node`, `@org/pipeline-steps` — Gemeinsame Pipeline-Engine
