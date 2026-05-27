# HTML to Markdown gogol pattern

Use this file when implementing any gogol that converts HTML pages to Markdown text.

## Required libraries

Always use these three libraries together. Do not write a hand-rolled HTML→Markdown converter.

```
@mozilla/readability   — extracts main article content, strips nav / header / footer / ads
jsdom                  — provides a DOM environment required by Readability in Node.js
turndown               — converts the extracted HTML fragment to clean Markdown
turndown-plugin-gfm    — adds GFM table and strikethrough support to turndown
```

Install into the app:

```
pnpm --filter @org/<app-name> add turndown turndown-plugin-gfm @mozilla/readability jsdom @types/turndown @types/jsdom
```

`turndown-plugin-gfm` ships no TypeScript declarations. Add a `run/vendor.d.ts` in the app:

```ts
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export function gfm(service: TurndownService): void;
  export function tables(service: TurndownService): void;
  export function strikethrough(service: TurndownService): void;
  export function taskListItems(service: TurndownService): void;
}
```

The `tsconfig.json` `include` array must cover `run/**/*.d.ts` for the declaration to be picked up.

## Core conversion function

```ts
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const createTurndown = (): TurndownService => {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  td.use(gfm);
  return td;
};

export const htmlToMarkdown = (html: string, url: string, title?: string): string => {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const td = createTurndown();
  const heading = title?.trim() ? `# ${title.trim()}\n\n` : '';

  if (article?.content) {
    return `${heading}${td.turndown(article.content)}\n`;
  }

  return `${heading}${td.turndown(html)}\n`;
};
```

Always pass the real page URL as `url` so Readability and jsdom correctly resolve relative links.
The fallback to raw `html` when `article.content` is null handles pages that Readability cannot parse (single-screen apps, login walls, etc.).

## Artifact layout convention

When a gogol converts a directory tree of HTML files produced by an upstream gogol, mirror the source layout:

```
<upstream-gogol-id>/sites/{domain}/{page}.html   ← source
<this-gogol-id>/sites/{domain}/{page}.md         ← output
```

This makes it easy for downstream gogols to find the Markdown counterpart of any HTML file by replacing the gogol output directory prefix and the file extension.

## Do not carry over from the old hand-rolled converter

The following patterns appeared in the legacy `inticle` implementation and have been fully replaced:

- `removeIgnoredBlocks` — regex stripping of `<script>`, `<style>`, `<nav>`, etc.
- `replaceStructuralTags` — regex mapping of heading / list / table tags to Markdown
- `normalizeMarkdown` / `ensureSingleTitle` / `stripRemainingHtmlTags` — post-processing passes
- Manual entity decoding via `decodeHtmlEntities`

All of the above are handled automatically and more correctly by Readability + jsdom + turndown.

## Reference implementations

- `apps/inticle/run/gogols/HtmlToMarkdownGogol.ts` — reads `download/{hid}.raw.txt` from a source gogol `result.json` contract, writes `download/{hid}.md` with word / heading / link statistics.
