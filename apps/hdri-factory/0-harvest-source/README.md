# @org/catalog-harvest

Pipeline for loading primary site lists from external catalogs (T0 — Ingestion).

## How It Handles Sites from Multiple Sources

When the same website appears in multiple catalog sources, the pipeline:

- **Deduplicates automatically**: Each website domain is stored only once, regardless of how many times it appears across different source files or batches.
- **Preserves source information**: All original business data from each source (company name, address, category, etc.) is kept and linked to the single domain record.
- **Aggregates categories for classification**: If different sources list different industry categories for the same site, all unique categories are collected and used together to determine the best industry classification.
- **Tracks discovery history**: The pipeline records when a site was first seen and when it was last seen, allowing you to track site recurrence across harvests.

**Result**: You get one clean domain record per website, with all available business data from all sources preserved and a unified industry classification.

## Data sources

Catalog files placed in `.input/batches/` are typically sourced from public registers and industry directories, for example:

- **Handwerkskammer member directories** — public listings of chamber-member businesses
- **IHK company registers** — publicly searchable business entries
- **Trade-fair exhibitor lists** — publicly published participant catalogs
- **Industry association websites** — member or service-provider listings
- **Manual research** — direct collection from Google Maps, local business listings, or chamber websites

The pipeline does not connect to these systems live; it ingests static files (CSV/HTML/MHTML) that you prepare offline.

## Getting Started

1. Prepare `.input/brief.md` with `sourceToken` (format: `YYYY-Qn-CC[-extra]`).
2. Place catalog files (CSV/HTML) in `.input/batches/<batch-name>/`.
3. Run from the monorepo root:
   ```bash
   pnpm turbo run start --filter=@org/catalog-harvest
   ```
4. Monitor execution in `.output/_guide/`.
