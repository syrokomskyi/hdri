# Rendering package reference

Use the packages below whenever the listed concern arises in an app or package.
Do not hand-roll an alternative unless the explicit exception criteria in the
root `AGENTS.md` **Dependency-first rule** are met.

## Markdown → HTML

**Package:** `marked` + `@types/marked`

```
pnpm --filter @org/<app> add marked
pnpm --filter @org/<app> add -D @types/marked
```

```ts
import { marked } from 'marked';

// marked is async-by-default in v5+; use synchronous parse when you don't
// need the async pipeline (no custom async extensions).
export const markdownToHtml = (md: string): string =>
  marked.parse(md, { async: false }) as string;
```

Wrap the output in a minimal HTML shell for standalone documents:

```ts
export const wrapHtmlDocument = (title: string, body: string, opts?: {
  publisher?: string; publisherUrl?: string; licence?: string; sourceUri?: string;
}): string => { /* ... */ };
```

See `apps/site/run/render/markdown-to-html.ts` (or any app-local render module)
for a current reference implementation.

## HTML → Markdown (article extraction)

See [`.agents/rules/html-to-markdown.md`](html-to-markdown.md) — uses
`@mozilla/readability` + `jsdom` + `turndown` + `turndown-plugin-gfm`.

## Markdown table formatting

**Package:** `markdown-table` (ESM-only, fully typed, zero-dep, auto-aligns columns)

```
pnpm --filter @org/<app> add markdown-table
```

```ts
import { markdownTable } from 'markdown-table';

// Each sub-array is a row; first row is the header.
// align: 'l' = left, 'r' = right, 'c' = center.
const table = markdownTable(
  [
    ['Metric', 'Value'],
    ['Sites', '1 234'],
    ['Live',  '1 100'],
  ],
  { align: ['l', 'r'] },
);
```

Use `markdownTable()` whenever a gogol needs to write a GFM table into a `.md`
file. Do not hand-roll `| col | col |` + `|---|---|` strings.

## CSV serialisation

**Package:** `csv-stringify` (sync API) + `@types/csv-stringify` (if available,
else rely on the package's own bundled types).

```
pnpm --filter @org/<app> add csv-stringify
```

```ts
import { stringify } from 'csv-stringify/sync';

export const toCsv = (columns: string[], rows: object[]): string =>
  stringify(rows, { header: true, columns });
```

See any app-local `run/render/csv.ts` for a current reference implementation.

## SVG badges (shields.io-style)

No npm package needed — badge SVG is trivial (two rectangles + text). Keep the
helper under 20 lines of template logic. This is an approved exception under the
"< 20 lines, no edge cases" criteria.

## YAML frontmatter parsing

**Package:** `gray-matter` (already used across all apps for `brief.md`).

## JSON schema validation

**Package:** `zod` — for structured validation of external data (brief fields,
API responses, DB row shapes where column types are uncertain).

## Image transforms

**Package:** `sharp` — install with dynamic `import()` (it bundles native
binaries) so fixture-only runs don't fail without the binary.

## PDF generation

Not yet standardised. When needed, evaluate `puppeteer` (headless Chrome) or
`pdfkit` and add the canonical pattern here before implementing.
