# HDRI Dashboard

> [Deutsche Version](README.md)

Static Astro dashboard for aggregated, anonymised HDRI (Handwerk Digital Readiness Index) data produced by `apps/hdri/observatory`.

## Commands

```bash
# Build existing public data (does not export or rerun collection)
pnpm --filter @syrokomskyi/dashboard run build

# Dev mode with live reload
pnpm --filter @syrokomskyi/dashboard run dev

# Type-check
pnpm --filter @syrokomskyi/dashboard run typecheck
```

## Deploy

- Build command: `pnpm --filter @syrokomskyi/dashboard run build`
- Output directory: `apps/hdri/dashboard/dist`
- Live site: [handwerk-index.org](https://handwerk-index.org)

## Data source & refresh

Build consumes existing public files under `src/assets/data/public/`; it never
opens observation databases or runs collection. `dev` still invokes the guarded
exporter, while `start` runs Astro against existing data. Export and deployment
require verified publication admission, separately from a successful build.

Historical Q2 score files remain unchanged. Availability-only releases are loaded
from `availability/<period>/public-manifest.json` with `availability.json` and
`availability.csv`. The loader checks exact product bytes and four-outcome schema v2;
private preview descriptors are rejected. Install files only through the admitted
release workflow, never by copying a private candidate to make the build pass.

Availability is displayed separately from the historical score index, with exact-byte
JSON/CSV downloads at `/daten/verfuegbarkeit/<period>.{json,csv}`. Do not advance the
score `latest.json` pointer, invent scores or infer quarter trends from unlike products.
Changing today's codebook does not invalidate or authorize rewriting past results.

Q3 data collection and private verification are complete enough for these integration
checks; final release admission, public installation and deployment remain pending.
Tests from the repository root:
`pnpm exec vitest run --root apps/hdri/dashboard src/tests/availability.test.ts`.
The isolated build test uses a synthetic quarter only in a temporary workspace.

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
