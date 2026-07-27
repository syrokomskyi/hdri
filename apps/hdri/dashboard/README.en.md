# HDRI Dashboard

> [Deutsche Version](README.md)

Static Astro dashboard for aggregated, anonymised HDRI (Handwerk Digital Readiness Index) data produced by `apps/hdri/observatory`.

## Commands

```bash
# Build (also runs the data-export step automatically)
pnpm --filter @syrokomskyi/dashboard run build

# Dev mode with live reload
pnpm --filter @syrokomskyi/dashboard run dev

# Type-check
pnpm --filter @syrokomskyi/dashboard run typecheck
```

## Deploy

- Build command: `pnpm --filter @syrokomskyi/dashboard run build`
- Output directory: `apps/hdri/dashboard/dist`
- Live site: [handwerk-index.de](https://handwerk-index.de)

## Data source & refresh

Before the Astro build, the export script in `apps/hdri/observatory/tools/export-dashboard-archive.ts` runs automatically. It reads the current `observatory.db` and writes public JSON files into `src/assets/data/public/`.

### Important: re-run the pipeline after any codebook change

Changes to `apps/hdri/observatory/.input/codebook.yaml` only take effect after the scoring phase re-runs:

1. **Run the observatory pipeline** (ScoreHdriGogol reads the current codebook):

   ```bash
   pnpm --filter @syrokomskyi/observatory start
   ```

2. **Build the dashboard** (automatically triggers the export step):
   ```bash
   pnpm --filter @syrokomskyi/dashboard run build
   ```

Skipping step 1 means the dashboard export continues to use the old scores from the database.

## Architecture

The dashboard uses centralised modules to avoid duplication:

| Module | Purpose |
| --- | --- |
| `src/types.ts` | Shared TypeScript types (`Summary`, `Maturity`, `ComparisonPoint`, etc.) |
| `src/lib/format.ts` | Formatting functions (`score`, `count`, `pct`, `weight`, `deltaLabel`, etc.) — all with `LOCALE = "de-DE"` |
| `src/lib/seo.ts` | Centralised `site` URL, `ogImage`, and `publisher()` for schema.org — no hardcoded URLs in pages |
| `src/data/dashboard-data.ts` | Data loaders (`loadCurrentPeriod`, `loadCodebook`, `loadChangelog`) — all `import.meta.glob` calls centralised |
| `src/scripts/tooltip.ts` | `initTooltips(selector)` for accessible tooltip interaction |
| `src/components/ComparisonTable.astro` | Reusable comparison table with provenance badge and detail modes |

Pages and components import from these modules instead of duplicating types, formatting functions, or SEO constants.

## Agent Readiness & DNS-AID

The dashboard implements agent-readiness features (Link header, API catalogue, markdown negotiation, WebMCP, auth.md, agent-skills index, MCP server card). DNS-AID records must be configured manually in the domain's DNS:

```dns
_index._agents.handwerk-index.org. 3600 IN SVCB 1 handwerk-index.org. alpn="h2" port=443 mandatory=alpn,port
```

The zone should be signed with DNSSEC so that validating resolvers return authenticated data.
