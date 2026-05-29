# AGENTS.md — hdri-dashboard

See also the root `AGENTS.md` for repo-wide rules (write all comments and documentation in English).

## CSS convention

- No `<style>` blocks inside `.astro` files. Always use separate CSS files, imported in the frontmatter.
- Route pages → `src/styles/<route>.css` (e.g. `src/styles/glossar.css`)
- Components → `src/styles/<ComponentName>.css` (e.g. `src/styles/term.css`)
- Shared primitives → `src/styles/global.css`

## Popover API (Term component)

- The Term component uses native `popover="auto"` + CSS anchor positioning.
- Do NOT add `display: block` to the base `.term-popover` rule — it overrides the UA `[popover]{display:none}` and makes all popovers visible on page load.
- Only set `display: block` inside `.term-popover:popover-open`.
- Use absolute `px` units (not `rem`) for font sizes inside `:popover-open` to avoid DOM context inheritance in the top layer.

## Slot forwarding pattern

- `BaseLayout` forwards the `header-extra` slot into `SiteHeader`'s `extra` slot for page-specific header rows.
- The `.site-header-extra` element is hidden via `:has(> .container > *)` when the slot is empty.

## Lenis smooth scroll

- All anchor click handling is in `BaseLayout`'s Lenis script.
- Do not add separate `scroll-behavior` CSS.
