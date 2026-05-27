# HDRI Dashboard

Statisches Astro-Dashboard für aggregierte und anonymisierte HDRI (Handwerk Digital Readiness Index) Daten aus `apps/digital-observatory`.

## Befehle

```bash
# Build (führt automatisch Daten-Export aus)
pnpm --filter @org/hdri-dashboard run build

# Dev-Modus mit Live-Reload
pnpm --filter @org/hdri-dashboard run dev

# TypeScript-Prüfung
pnpm --filter @org/hdri-dashboard run typecheck
```

## Deploy auf Cloudflare Pages

- Build command: `pnpm --filter @org/hdri-dashboard run build`
- Output directory: `apps/hdri-dashboard/dist`

## Datenquelle & Aktualisierung

Vor dem Astro-Build wird automatisch `apps/digital-observatory/tools/export-hdri-dashboard-archive.ts` ausgeführt.
Dieser Schritt liest die aktuelle `observatory.db` und schreibt öffentliche JSON-Dateien nach `src/assets/data/public/`.

### Wichtig: Pipeline neu starten nach Codebook-Änderung

Änderungen an `apps/digital-observatory/.input/codebook.yaml` wirken sich erst aus, wenn das Scoring neu läuft:

1. **Observatory-Pipeline ausführen** (ScoreHdriGogol liest das aktuelle Codebook):
   ```bash
   pnpm --filter @org/digital-observatory start
   ```

2. **Dashboard-Build** (führt automatisch den Export-Schritt aus):
   ```bash
   pnpm --filter @org/hdri-dashboard run build
   ```

Ohne Schritt 1 arbeitet der Dashboard-Export mit den alten Scores aus der Datenbank.
