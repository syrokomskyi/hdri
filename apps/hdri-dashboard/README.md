# HDRI-Dashboard

> [English Version](README.en.md)

Statisches Astro-Dashboard für aggregierte, anonymisierte HDRI-Daten (Handwerk Digital Readiness Index), die von `apps/digital-observatory` erzeugt wurden.

## Befehle

```bash
# Bauen (führt auch automatisch den Datenexport-Schritt aus)
pnpm --filter @org/hdri-dashboard run build

# Dev-Modus mit Live-Reload
pnpm --filter @org/hdri-dashboard run dev

# Typprüfung
pnpm --filter @org/hdri-dashboard run typecheck
```

## Bereitstellung

- Build-Befehl: `pnpm --filter @org/hdri-dashboard run build`
- Ausgabeverzeichnis: `apps/hdri-dashboard/dist`
- Live-Website: [handwerk-index.de](https://handwerk-index.de)

## Datenquelle & Aktualisierung

Vor dem Astro-Build wird das Exportskript in `apps/digital-observatory/tools/export-hdri-dashboard-archive.ts` automatisch ausgeführt. Es liest die aktuelle `observatory.db` und schreibt öffentliche JSON-Dateien in `src/assets/data/public/`.

### Wichtig: Führen Sie die Pipeline nach jeder Codebook-Änderung erneut aus

Änderungen an `apps/digital-observatory/.input/codebook.yaml` wirken sich erst aus, nachdem die Bewertungsphase erneut ausgeführt wurde:

1. **Führen Sie die Observatorium-Pipeline aus** (ScoreHdriGogol liest das aktuelle Codebook):
   ```bash
   pnpm --filter @org/digital-observatory start
   ```

2. **Bauen Sie das Dashboard** (löst automatisch den Export-Schritt aus):
   ```bash
   pnpm --filter @org/hdri-dashboard run build
   ```

Wenn Schritt 1 übersprungen wird, verwendet der Dashboard-Export weiterhin die alten Scores aus der Datenbank.
