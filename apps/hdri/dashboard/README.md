# HDRI-Dashboard

> [English Version](README.en.md)

Statisches Astro-Dashboard für aggregierte, anonymisierte HDRI-Daten (Handwerk Digital Readiness Index), die von `apps/hdri/observatory` erzeugt wurden.

## Befehle

```bash
# Bauen (führt auch automatisch den Datenexport-Schritt aus)
pnpm --filter @syrokomskyi/dashboard run build

# Dev-Modus mit Live-Reload
pnpm --filter @syrokomskyi/dashboard run dev

# Typprüfung
pnpm --filter @syrokomskyi/dashboard run typecheck
```

## Bereitstellung

- Build-Befehl: `pnpm --filter @syrokomskyi/dashboard run build`
- Ausgabeverzeichnis: `apps/hdri/dashboard/dist`
- Live-Website: [handwerk-index.de](https://handwerk-index.de)

## Datenquelle & Aktualisierung

Vor dem Astro-Build wird das Exportskript in `apps/hdri/observatory/tools/export-dashboard-archive.ts` automatisch ausgeführt. Es liest die aktuelle `observatory.db` und schreibt öffentliche JSON-Dateien in `src/assets/data/public/`.

### Wichtig: Führen Sie die Pipeline nach jeder Codebook-Änderung erneut aus

Änderungen an `apps/hdri/observatory/.input/codebook.yaml` wirken sich erst aus, nachdem die Bewertungsphase erneut ausgeführt wurde:

1. **Führen Sie die Observatorium-Pipeline aus** (ScoreHdriGogol liest das aktuelle Codebook):

   ```bash
   pnpm --filter @syrokomskyi/observatory start
   ```

2. **Bauen Sie das Dashboard** (löst automatisch den Export-Schritt aus):
   ```bash
   pnpm --filter @syrokomskyi/dashboard run build
   ```

Wenn Schritt 1 übersprungen wird, verwendet der Dashboard-Export weiterhin die alten Scores aus der Datenbank.

## Architektur

Das Dashboard verwendet zentrale Module, um Duplikation zu vermeiden:

| Modul | Zweck |
| --- | --- |
| `src/types.ts` | Gemeinsame TypeScript-Typen (`Summary`, `Maturity`, `ComparisonPoint`, etc.) |
| `src/lib/format.ts` | Formatierungsfunktionen (`score`, `count`, `pct`, `weight`, `deltaLabel`, etc.) — alle mit `LOCALE = "de-DE"` |
| `src/lib/seo.ts` | Zentrale `site`-URL, `ogImage` und `publisher()` für schema.org — keine hartcodierten URLs in Seiten |
| `src/data/dashboard-data.ts` | Datenlader (`loadCurrentPeriod`, `loadCodebook`, `loadChangelog`) — alle `import.meta.glob`-Aufrufe zentralisiert |
| `src/scripts/tooltip.ts` | `initTooltips(selector)` für barrierefreie Tooltip-Interaktion |
| `src/components/ComparisonTable.astro` | Wiederverwendbare Vergleichstabelle mit Provenienz-Badge und Detail-Modi |

Seiten und Komponenten importieren aus diesen Modulen, anstatt Typen, Formatierungsfunktionen oder SEO-Konstanten zu duplizieren.

## Agent Readiness & DNS-AID

Das Dashboard implementiert Agent-Readiness-Features (Link-Header, API-Katalog, Markdown-Negotiation, WebMCP, auth.md, Agent-Skills-Index, MCP Server Card). DNS-AID-Einträge müssen manuell im DNS der Domain konfiguriert werden:

```dns
_index._agents.handwerk-index.org. 3600 IN SVCB 1 handwerk-index.org. alpn="h2" port=443 mandatory=alpn,port
```

Die Zone sollte mit DNSSEC signiert sein, damit validierende Resolver authentifizierte Daten zurückgeben.

## Changelog

- [CHANGELOG.md](CHANGELOG.md)
- [CHANGELOG_PUBLIC.md](CHANGELOG_PUBLIC.md)
