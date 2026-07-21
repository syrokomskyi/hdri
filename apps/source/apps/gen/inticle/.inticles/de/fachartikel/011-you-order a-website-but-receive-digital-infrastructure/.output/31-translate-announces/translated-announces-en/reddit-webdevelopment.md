In web development, small websites are often underestimated as engineering objects. But a local business website can look simple on the surface and still require serious data architecture, build processes, releases, and ownership.

- Static generation with Astro and TypeScript is not valuable here in itself. The value is that the website becomes a compiled artifact: no server-side generation for every page, no database required for rendering, no chain of plugins that must be constantly maintained. This does not make other approaches bad. It is simply a different risk profile, especially for websites where content changes in a controlled way rather than hourly.

- Declarative content and typed blocks solve a typical maintenance problem. If pages are described in Markdown/YAML, validated against a schema, and business data is separated out, the developer depends less on manual checks and arbitrary HTML inside the content. A price, address, or company detail changes in one place, not through a search across the entire repository.

- The interesting part is the programmatic constraints on design and the release process. Tokens, CSS variables, a ban on hardcoded colors, validation, change history, and blocking direct edits on the live site turn even a small project into a managed system. This may look excessive until the first incident, when you need to understand exactly what changed and why communication broke down.

What min set of architectural rules would you build into even a small website for a local business?
