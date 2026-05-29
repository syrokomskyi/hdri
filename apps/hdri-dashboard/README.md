# HDRI Dashboard

Static Astro dashboard for aggregated, anonymised HDRI (Handwerk Digital Readiness Index) data produced by `apps/digital-observatory`.

## Commands

```bash
# Build (also runs the data-export step automatically)
pnpm --filter @org/hdri-dashboard run build

# Dev mode with live reload
pnpm --filter @org/hdri-dashboard run dev

# Type-check
pnpm --filter @org/hdri-dashboard run typecheck
```

## Deploy

- Build command: `pnpm --filter @org/hdri-dashboard run build`
- Output directory: `apps/hdri-dashboard/dist`

## Data source & refresh

Before the Astro build, the export script in `apps/digital-observatory/tools/export-hdri-dashboard-archive.ts` runs automatically. It reads the current `observatory.db` and writes public JSON files into `src/assets/data/public/`.

### Important: re-run the pipeline after any codebook change

Changes to `apps/digital-observatory/.input/codebook.yaml` only take effect after the scoring phase re-runs:

1. **Run the observatory pipeline** (ScoreHdriGogol reads the current codebook):
   ```bash
   pnpm --filter @org/digital-observatory start
   ```

2. **Build the dashboard** (automatically triggers the export step):
   ```bash
   pnpm --filter @org/hdri-dashboard run build
   ```

Skipping step 1 means the dashboard export continues to use the old scores from the database.
