# HDRI Factory

> [English Version](README.en.md) · [Betriebshandbuch](RUNBOOK.md)

Crawl-Factory-Komponenten, die Rohsignale sammeln und für das Digital Observatory aufbereiten.

## Pipeline-Kette

```
0-harvest-source → 1-register-businesses → 2-check-liveness → 3-extract-profile → 4-audit-lighthouse → 5-audit-axe
     ↓                     ↓                      ↓                    ↓                    ↓                    ↓
  core_YYYY.db       registry_YYYY.db       liveness_YYYY.db    pages_YYYY.db    lighthouse_YYYY.db      axe_YYYY.db
```

Jede Pipeline hängt von der vorherigen ab. **Immer in dieser Reihenfolge ausführen.**

## Phasenübersicht

| Phase | Zweck | Ausgabe |
|---|---|---|
| `0-harvest-source` | Quellkataloge aus öffentlichen Verzeichnissen (Handwerkskammer, IHK, Branchenbörsen) erfassen und parsen | `core_YYYY.db` |
| `1-register-businesses` | Domänen deduplizieren, deterministische Asset-IDs prägen | `registry_YYYY.db` |
| `2-check-liveness` | HTTP/HTTPS-Erreichbarkeit prüfen | `liveness_YYYY.db` |
| `3-extract-profile` | Startseiten crawlen, 42 Signaltypen extrahieren | `pages_YYYY.db` |
| `4-audit-lighthouse` | Lighthouse-Leistungsaudits ausführen | `lighthouse_YYYY.db` |
| `5-audit-axe` | axe-Barrierefreiheitsaudits ausführen | `axe_YYYY.db` |

Hinweis: HDRI-Bewertung und Veröffentlichung befinden sich in `apps/digital-observatory`, nicht hier.

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
   pnpm turbo run build --filter=@org/pipeline-core --filter=@org/pipeline-node --filter=@org/pipeline-steps
   ```

2. **Pipeline-Kette ausführen**:
   ```bash
   # Phase 0: Quellen erfassen
   pnpm turbo run start --filter=@org/catalog-harvest

   # Phase 1: Unternehmen registrieren
   pnpm turbo run start --filter=@org/register-businesses

   # Phase 2: Erreichbarkeit prüfen
   pnpm turbo run start --filter=@org/site-liveness

   # Phase 3: Profile extrahieren
   pnpm turbo run start --filter=@org/site-profile

   # Phase 4: Lighthouse-Audits
   pnpm turbo run start --filter=@org/site-lighthouse-audit

   # Phase 5: axe-Audits
   pnpm turbo run start --filter=@org/site-axe-audit
   ```

Oder führen Sie die gesamte Kette auf einmal aus:
```bash
pnpm turbo run start --filter=@org/catalog-harvest --filter=@org/register-businesses --filter=@org/site-liveness --filter=@org/site-profile --filter=@org/site-lighthouse-audit --filter=@org/site-axe-audit
```

## Konfiguration

Jede Phase hat ihre eigene `brief.md` in `<phase>/.input/brief.md`. Gemeinsame Konfigurationen (z. B. `zipcodesTablePath`) werden aus `apps/hdri-factory/.input/brief.md` gelesen und mit der App-lokalen `brief.md` zusammengeführt.

## Datenschutz und K-Anonymität

Die Veröffentlichungspipeline erzwingt K-Anonymität:

- Standardmodus ist `enforce` (Fehlschlag, wenn eine Schicht weniger als k_min=5 Websites hat)
- Nur für die Entwicklung auf `warn` umstellen
- Veröffentlichungsmodus `public` entfernt identifizierende Daten (Domäne, gewerk, bundesland, echte site_id)
- Veröffentlichungsmodus `internal` enthält identifizierende Daten für den internen Gebrauch

## Ausgabe-Artefakte

Nach der vollständigen Kette:

```
apps/hdri-factory/
  0-harvest-source/.output/
    core_YYYY.db               # Website-Katalog
    _guide/0-harvest-source/   # Berichte
    <step>-sign-source/        # Signaturmanifest
  1-register-businesses/.output/
    registry_YYYY.db           # Dedupliziertes Unternehmensregister
    <step>-sign-source/        # Signaturmanifest
  2-check-liveness/.output/
    liveness_YYYY.db           # Erreichbarkeitsstatus
  3-extract-profile/.output/
    pages_YYYY.db              # Seitenbeobachtungen + ext_*-Signale
    data/content/              # CAS-HTML-Speicher
  4-audit-lighthouse/.output/
    lighthouse_YYYY.db         # Lighthouse-Metriken
    data/audit-reports/        # CAS-Audit-JSON
  5-audit-axe/.output/
    axe_YYYY.db                # axe-Verletzungen
    data/audit-reports/        # CAS-Audit-JSON
```

## Weiterführende Dokumentation

- [`AGENTS.md`](./AGENTS.md) — AI-Agent-Leitfaden für die hdri-factory-Pipeline
- [`RUNBOOK.md`](./RUNBOOK.md) — Betriebshandbuch für Operatoren
- [`apps/digital-observatory`](../digital-observatory) — Asset-Zustandsverfolgung, HDRI-Bewertung, Mart-Generierung
- [`METHODOLOGY.md`](../../METHODOLOGY.md) — Wissenschaftliche Methodik des HDRI
- [`GOVERNANCE.md`](../../GOVERNANCE.md) — Projekt-Governance und Rollen
