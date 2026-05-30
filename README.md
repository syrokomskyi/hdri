# HDRI-Analyseplattform

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/syrokomskyi/hdri/ci.yml?logo=github-actions&logoColor=white)](https://github.com/syrokomskyi/hdri/actions)
[![Issues](https://img.shields.io/github/issues/syrokomskyi/hdri?logo=github&logoColor=white)](https://github.com/syrokomskyi/hdri/issues)

> [English Version](README.en.md) · [🌐 handwerk-index.de](https://handwerk-index.de)

Ein Turborepo-Monorepo zum Sammeln, Analysieren und Veröffentlichen des **Handwerk Digital Readiness Index (HDRI)** — eine longitudinale, signalbasierte Bewertung der Online-Präsenz von Handwerksunternehmen.

## Was dieses Projekt leistet

Die Plattform besteht aus drei Ebenen:

1. **Fabrik** ([`apps/hdri-factory`](apps/hdri-factory/README.md)) — Erfasst Website-Kataloge aus öffentlichen Verzeichnissen (Handwerkskammer, IHK, Branchenbörsen), prüft Erreichbarkeit, crawlt Startseiten und führt Lighthouse- sowie axe-Audits durch.
2. **Observatorium** ([`apps/digital-observatory`](apps/digital-observatory/README.md)) — Ordnet Rohsignale einer Ontologie zu, bewertet sie mit einem konfigurierbaren Codebook und erstellt datenschutzsichere Data Marts.
3. **Dashboard** ([`apps/hdri-dashboard`](apps/hdri-dashboard/README.md)) — Eine statische Astro-Website, die die bewerteten, anonymisierten Daten für die Öffentlichkeit visualisiert.

Ingenieure und Analysten können die Pipelines lokal ausführen, Zwischenspeicher von SQLite-Datenbanken prüfen und das Dashboard nach jeder Bewertungs- oder Codebook-Änderung neu aufbauen.

## Arbeitsbereich-Layout

```text
apps/
  hdri-factory/
    0-harvest-source/       Katalog-Erfassung
    1-register-businesses/  Domänen-Deduplizierung & Asset-ID-Prägung
    2-check-liveness/       HTTP/HTTPS-Erreichbarkeitsprüfungen
    3-extract-profile/      Startseiten-Crawling & Signalextraktion
    4-audit-lighthouse/     Lighthouse-Leistungsaudits
    5-audit-axe/            axe-Barrierefreiheitsaudits
    a-contract-ontology/    Signierte Beobachtungen für das Observatorium bündeln
  digital-observatory/      Longitudinale Bewertung & Kohortenanalyse
  hdri-dashboard/           Öffentliches Astro-Dashboard

packages/
  business-core/            SQLite-Schemas & Geschäftseinheiten
  business-crawler/         Gemeinsame Crawling-Hilfsmittel
  business-rate-limit/      Ratenbegrenzungshilfsmittel
  hdri-codebook/            YAML-Codebook-Parser & Bewertungsengine
  hdri-factory-core/        Fabrikspezifische gemeinsame Logik
  observatory-asset-id/     Deterministische Asset-ID-Ableitung
  observatory-core/         Ontologie, Beobachtungen, Validierung
  observatory-crypto/       Signier- & Hashing-Hilfsmittel
  observatory-emit/         Bündel-Emissionshilfsmittel
  observatory-vault/        Sichere Speicherabstraktionen
  pipeline-ai/              LLM-Prompt-Runner & Antwortprotokollierung
  pipeline-core/            Pipeline-Engine-Kern (Schritte, Phasen, Orchestrierung)
  pipeline-node/            Node.js-Laufzeitadapter
  pipeline-steps/           Wiederverwendbare Schritt-Basisklassen
  utils/                    Allgemeine Hilfsmittel
```

## Voraussetzungen

- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Playwright Chromium](https://playwright.dev/) (nur für `5-audit-axe`):
  ```bash
  npx playwright install chromium
  ```

## Installation

```bash
pnpm install
```

## Schnellstart

1. **Gemeinsame Pakete bauen**, bevor eine Pipeline ausgeführt wird:
   ```bash
   pnpm turbo run build --filter=@org/pipeline-core --filter=@org/pipeline-node --filter=@org/pipeline-steps --filter=@org/observatory-core --filter=@org/hdri-codebook
   ```

2. **Eine Fabrik-Pipeline ausführen** (Beispiel: Quellkataloge erfassen):
   ```bash
   pnpm turbo run start --filter=@org/catalog-harvest
   ```

3. **Das Observatorium ausführen**, nachdem die Factory-Schritte abgeschlossen sind:
   ```bash
   pnpm --filter @org/digital-observatory start
   ```

4. **Das Dashboard bauen**:
   ```bash
   pnpm --filter @org/hdri-dashboard run build
   ```

Die einzelnen README-Dateien unten verlinkt enthalten die detaillierte Konfiguration jeder App.

## App-Handbücher

- [`apps/hdri-factory/0-harvest-source`](apps/hdri-factory/0-harvest-source/README.md) — Quellkataloge erfassen (CSV/HTML)
- [`apps/hdri-factory/1-register-businesses`](apps/hdri-factory/1-register-businesses/README.md) — Domänen über Batches hinweg deduplizieren
- [`apps/hdri-factory/2-check-liveness`](apps/hdri-factory/2-check-liveness/README.md) — Prüfen, welche Websites antworten
- [`apps/hdri-factory/3-extract-profile`](apps/hdri-factory/3-extract-profile/README.md) — Live-Startseiten crawlen
- [`apps/hdri-factory/4-audit-lighthouse`](apps/hdri-factory/4-audit-lighthouse/README.md) — Lighthouse-Audits ausführen
- [`apps/hdri-factory/5-audit-axe`](apps/hdri-factory/5-audit-axe/README.md) — axe-Barrierefreiheitsaudits ausführen
- [`apps/hdri-factory/a-contract-ontology`](apps/hdri-factory/a-contract-ontology/README.md) — Beobachtungen für das Observatorium bündeln
- [`apps/digital-observatory`](apps/digital-observatory/README.md) — Signale bewerten und Kohorten aufbauen
- [`apps/hdri-dashboard`](apps/hdri-dashboard/README.md) — Das öffentliche Dashboard bauen
- [`apps/hdri-factory/RUNBOOK.md`](apps/hdri-factory/RUNBOOK.md) — Betriebshandbuch für die Factory-Pipeline-Kette
- [`METHODOLOGY.md`](METHODOLOGY.md) — Wissenschaftliche Methodik des HDRI (Gewichte, Signale, Sampling)
- [`GOVERNANCE.md`](GOVERNANCE.md) — Projekt-Governance und Rollen
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — Verhaltensregeln für Mitwirkende

## Nützliche Befehle

```bash
# Alles auf Typen prüfen
pnpm turbo run typecheck

# Alles bauen
pnpm turbo run build

# Eine bestimmte App ausführen
pnpm turbo run start --filter=@org/digital-observatory

# Den Aufgabengraphen visualisieren
pnpm turbo graph --dot > turbo.dot
```

## Pipeline-Konventionen

Jede App in `apps/*` folgt demselben Laufzeit-Layout:

- `.input/` — Manuell bereitgestellte Konfiguration (`brief.md`, Katalogdateien usw.)
- `.output/` — Generierte Artefakte und SQLite-Datenbanken
- `run/` — Quellcode, Gogols und Orchestrierung

Pipelines sind auf **schnelles Fehlschlagen** ausgelegt: Wenn ein nachgelagerter Schritt keine gültigen Upstream-Daten hat, pausiert die Laufzeit, gibt einen Diagnoseleitfaden aus und erstellt kein leeres Schrittverzeichnis.

Umgebungsvariablen werden aus der App-lokalen `.env`-Datei geladen, wenn die App startet.

## Turborepo-Referenzen

- [Turborepo-Dokumentation](https://turborepo.com/docs)
- [Turborepo-Aufgaben](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Turborepo-Caching](https://turborepo.com/docs/crafting-your-repository/caching)

## Öffentliche Mission

Der **Handwerk Digital Readiness Index (HDRI)** wird als öffentliches Gut entwickelt.

Der deutsche Handwerkssektor — über eine Million Unternehmen mit etwa fünf Millionen Beschäftigten — bildet das Rückgrat der regionalen Wirtschaft des Landes. Dennoch bleibt die digitale Präsenz der meisten Handwerksunternehmen untererforscht, fragmentiert und schwer skalierbar zu bewerten. Der HDRI wurde geschaffen, um das zu ändern.

Diese Plattform ist bewusst offen: Jede Pipeline, jede Bewertungsregel und jedes Codebook-Gewicht sind versioniert und nachvollziehbar. Aggregierte, anonymisierte Quartalsdaten werden auf **[handwerk-index.de](https://handwerk-index.de)** veröffentlicht. Jeder Forscher, jede Handelskammer, jedes Ministerium und jeder Civic Technologist können prüfen, wie der Index konstruiert ist, seine Annahmen in Frage stellen, seine Methodik erweitern oder seine Analyse auf neuen Daten neu ausführen. Undurchsichtigkeit hat in einem Werkzeug, das der öffentlichen Politikberatung dienen soll, keinen Platz.

### Für wen das ist

- **Handwerkskammern und Kreishandwerkerschaften** — Nutzen HDRI-Daten, um Mitgliederunternehmen zu benchmarken, unterversorgte Regionen zu identifizieren und digitale Förderprogramme zu priorisieren.
- **Bundes- und Landesministerien** (BMWK, Landeswirtschaftsministerien) — Nutzen den longitudinalen Datensatz, um die Wirkung von Digitalisierungsförderung zu verfolgen und evidenzbasierte Fortschrittsberichte zu erstellen.
- **Forschungseinrichtungen** (ZEW, Fraunhofer IAO, Universitätsabteilungen) — Bauen auf anonymisierten Kohortendaten und dem offenen Codebook für vergleichende oder sektorspezifische Studien auf.
- **Civic Technologists und Journalisten** — Erkunden das öffentliche Dashboard und die zugrunde liegenden Daten, um über regionale Disparitäten in der digitalen Bereitschaft zu berichten.

### Was „offen" hier bedeutet

Der Quellcode, die Pipeline-Logik, die Bewertungsengine und alle nicht-personenbezogenen abgeleiteten Daten werden unter der **[Apache License 2.0](LICENSE)** veröffentlicht. Sie dürfen sie frei nutzen, ändern und verteilen — für Forschung, Politikarbeit oder kommerzielle Anwendungen. Drei leichtgewichtige Verpflichtungen gelten: Beibehaltung der vorhandenen Urheberrechts- und Lizenzvermerke, Kennzeichnung geänderter Dateien und Beilegung des Lizenztexts bei Weiterverteilung. Kein Copyleft, keine Quellenoffenlegungspflicht, keine Registrierung. Patentrechte werden allen Nutzern ausdrücklich unter denselben Bedingungen eingeräumt.

Keine Registrierung, kein API-Schlüssel, keine Gebühr. Forke es, passe es an, deploye es.

### Wie man mitwirken kann

Beiträge auf allen Ebenen sind willkommen — von der Korrektur eines Codebook-Gewichts bis zur Integration einer neuen Datenquelle oder der Übersetzung des Dashboards ins Deutsche. Siehe [`CONTRIBUTING.md`](CONTRIBUTING.md) für die vollständigen Richtlinien.

- **Code oder Methodik** — lesen Sie [`CONTRIBUTING.md`](CONTRIBUTING.md), dann öffnen Sie ein Issue oder Pull Request
- **Partnerschaft oder Presse** — siehe [`CONTACT.md`](CONTACT.md) für Kooperationswege und Antwortzeiten
- **Einfach ein Gespräch beginnen** — eröffnen Sie ein [GitHub Issue](https://github.com/syrokomskyi/hdri/issues)

> Dieses Projekt wird von einem unabhängigen Entwickler mit Sitz in Backnang, Baden-Württemberg, Deutschland, gepflegt.
> Kontakt: [`CONTACT.md`](CONTACT.md) · [github.com/syrokomskyi](https://github.com/syrokomskyi)
