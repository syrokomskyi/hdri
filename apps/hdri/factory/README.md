# HDRI Factory

> [English Version](README.en.md) · [Betriebshandbuch](RUNBOOK.md)

Crawl-Factory-Komponenten, die Rohsignale sammeln und für das Digital Observatory aufbereiten.

## Pipeline-Kette

```
0-harvest-source → 1-register-businesses → 2-check-liveness → 3-extract-profile → 4-audit-lighthouse → 5-audit-axe
     ↓                     ↓                      ↓                    ↓                    ↓                    ↓
  core_YYYY.db       registry_YYYY.db       liveness-YYYY-qN.db pages-YYYY-qN.db lighthouse-YYYY-qN.db   axe-YYYY-qN.db
```

Jede Pipeline hängt von der vorherigen ab. **Immer in dieser Reihenfolge ausführen.**

Jeder neue Quartalsordner enthält ausschließlich neue Quelldateien. Bekannte Domains dürfen darin erneut vorkommen: Harvest speichert die neue Quellenbeobachtung, behält aber dieselbe stabile Asset-Identität. Vollständig verarbeitete Batches werden als unveränderliche Ledger-Segmente versiegelt; derselbe Name mit anderen Bytes wird abgelehnt. Bereits versiegelte `.input`- und `.output`-Artefakte werden niemals überschrieben oder gelöscht.

## Phasenübersicht

| Phase | Zweck | Ausgabe |
| --- | --- | --- |
| `0-harvest-source` | Quellkataloge aus öffentlichen Verzeichnissen (Handwerkskammer, IHK, Branchenbörsen) erfassen und parsen | `core_YYYY.db` |
| `1-register-businesses` | Domänen deduplizieren, deterministische Asset-IDs prägen | `registry_YYYY.db` |
| `2-check-liveness` | HTTP/HTTPS-Erreichbarkeit prüfen | `liveness-YYYY-qN.db` |
| `3-extract-profile` | Startseiten crawlen, Signaltypen extrahieren | `pages-YYYY-qN.db` |
| `4-audit-lighthouse` | Optionale Lighthouse-Leistungsaudits | `lighthouse-YYYY-qN.db` |
| `5-audit-axe` | axe-Barrierefreiheitsaudits ausführen | `axe-YYYY-qN.db` |

Hinweis: HDRI-Bewertung und Veröffentlichung befinden sich in `apps/hdri/observatory`, nicht hier.

## Voraussetzungen

- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/)
- Chrome/Chromium (für Audit-Pipelines)
- Playwright-Chromium (für `5-audit-axe`):
  ```bash
  npx playwright install chromium
  ```

## Installation

```bash
pnpm install
```

## Schnellstart

1. **Gemeinsame Pakete bauen**:

   ```bash
   pnpm turbo run build --filter=@syrokomskyi/pipeline-core --filter=@syrokomskyi/pipeline-node --filter=@syrokomskyi/pipeline-steps
   ```

2. **Pipeline-Kette ausführen**:

   ```bash
   # Phase 0: Quellen erfassen
   pnpm turbo run start --filter=@syrokomskyi/catalog-harvest

   # Phase 1: Unternehmen registrieren
   pnpm turbo run start --filter=@syrokomskyi/register-businesses

   # Phase 2: Erreichbarkeit prüfen
   pnpm turbo run start --filter=@syrokomskyi/site-liveness

   # Phase 3: Profile extrahieren
   pnpm turbo run start --filter=@syrokomskyi/site-profile

   # Phase 4: Lighthouse ist im Q3-2026-Instrumentplan deaktiviert

   # Phase 5: axe-Audits
   pnpm turbo run start --filter=@syrokomskyi/site-axe-audit
   ```

Für Q3 wird die Kette ohne Phase 4 ausgeführt; ein fehlender Lighthouse-Wert ist `disabled`, niemals null oder 0.

Oder führen Sie die konfigurierte Kette auf einmal aus:

```bash
pnpm turbo run start --filter=@syrokomskyi/catalog-harvest --filter=@syrokomskyi/register-businesses --filter=@syrokomskyi/site-liveness --filter=@syrokomskyi/site-profile --filter=@syrokomskyi/site-axe-audit
```

## Konfiguration

Jede Phase hat ihre eigene `brief.md` in `<phase>/.input/brief.md`. Gemeinsame Konfigurationen (z. B. `zipcodesTablePath`) werden aus `apps/hdri/factory/.input/brief.md` gelesen und mit der App-lokalen `brief.md` zusammengeführt.

## Datenschutz und K-Anonymität

Die Veröffentlichungspipeline erzwingt K-Anonymität:

- Standardmodus ist `enforce` (Fehlschlag, wenn eine Schicht weniger als effektiv k=12 Websites hat)
- Nur für die Entwicklung auf `warn` umstellen
- Veröffentlichungsmodus `public` entfernt identifizierende Daten (Domäne, gewerk, bundesland, echte site_id)
- Veröffentlichungsmodus `internal` enthält identifizierende Daten für den internen Gebrauch

## Ausgabe-Artefakte

Nach der vollständigen Kette:

```
apps/hdri/factory/
  0-harvest-source/.output/
    core_YYYY.db               # Website-Katalog
    _guide/0-harvest-source/   # Berichte
    <step>-sign-source/        # Signaturmanifest
  1-register-businesses/.output/
    registry_YYYY.db           # Dedupliziertes Unternehmensregister
    <step>-sign-source/        # Signaturmanifest
  2-check-liveness/.output/
    liveness-YYYY-qN.db        # Erreichbarkeitsstatus dieses Quartals
  3-extract-profile/.output/
    pages-YYYY-qN.db           # Seitenbeobachtungen + ext_*-Signale
    data/content/              # CAS-HTML-Speicher
  4-audit-lighthouse/.output/
    lighthouse-YYYY-qN.db      # optionale Lighthouse-Metriken
    data/audit-reports/        # CAS-Audit-JSON
  5-audit-axe/.output/
    axe-YYYY-qN.db             # axe-Verletzungen dieses Quartals
    data/audit-reports/        # CAS-Audit-JSON
```

## Weiterführende Dokumentation

- [`AGENTS.md`](./AGENTS.md) — AI-Agent-Leitfaden für die factory-Pipeline
- [`RUNBOOK.md`](./RUNBOOK.md) — Betriebshandbuch für Operatoren
- [`apps/hdri/observatory`](../observatory) — Asset-Zustandsverfolgung, HDRI-Bewertung, Mart-Generierung
- [`METHODOLOGY.md`](../../METHODOLOGY.md) — Wissenschaftliche Methodik des HDRI
- [`GOVERNANCE.md`](../../GOVERNANCE.md) — Projekt-Governance und Rollen

## Werkzeugskripte

| Skript | Zweck | Aufruf |
| --- | --- | --- |
| `batch-estimate.ts` | Grobe Schnellschätzung der Website-Anzahl in Batch-Eingabeordnern (Dateien, URL-Einträge, eindeutige Domains) ohne vollständige Pipeline-Ausführung | `pnpm estimate:hdri` |

## Changelog

[CHANGELOG.md](CHANGELOG.md)
