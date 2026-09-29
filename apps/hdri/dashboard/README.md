# HDRI-Dashboard

> [English Version](README.en.md)

Statisches Astro-Dashboard für aggregierte, anonymisierte HDRI-Daten (Handwerk Digital Readiness Index), die von `apps/hdri/observatory` erzeugt wurden.

## Befehle

```bash
# Build existing public data; no automatic export or collection
pnpm --filter @syrokomskyi/dashboard run build

# Dev-Modus mit Live-Reload
pnpm --filter @syrokomskyi/dashboard run dev

# Typprüfung
pnpm --filter @syrokomskyi/dashboard run typecheck
```

## Bereitstellung

- Build-Befehl: `pnpm --filter @syrokomskyi/dashboard run build`
- Ausgabeverzeichnis: `apps/hdri/dashboard/dist`
- Live-Website: [handwerk-index.org](https://handwerk-index.org)

## Datenquelle & Aktualisierung

Build reads existing public files only; it does not export, open observation
databases or rerun collection. `dev` still invokes the guarded exporter; `start`
serves existing data. Publication admission is separate from a successful build.

Q2 score data remain unchanged. Availability-only quarters use the separate
`src/assets/data/public/availability/<period>/` directory containing
`public-manifest.json`, `availability.json` and `availability.csv`. Exact bytes,
four outcomes and denominator are validated before rendering; preview manifests
are rejected. Only admitted releases may install these public files.

The home page keeps availability separate from scores, without a fabricated
quarter trend. JSON/CSV downloads preserve the manifest-bound bytes. Q3 public
installation and deployment are still pending final admission. Do not rerun
collection or rewrite historical Q2 because today's codebook changed.
See the [English guide](README.en.md#data-source--refresh) for paths and tests.

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
