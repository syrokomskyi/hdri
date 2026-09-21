# TypeScript supplement

Scope: `**/*.ts` and `**/*.astro`. Use this file only for TypeScript-specific guidance that supplements the scoped `AGENTS.md` hierarchy.

- The baseline monorepo, app, and package rules live in the nearest applicable `AGENTS.md` files.

# TypeScript

- Prefer the recommended rules from `@biomejs/biome`.
- Prefer `satisfies` for configs or constant tables to validate shape without making values readonly.
- Use `as const` only when you intentionally need literal unions, `keyof typeof` sources, or fixed-length tuples.
- Always use the `override` modifier when overriding class members.

# Docs

- **Remeda:** <https://remedajs.com/docs>
- **TypeScript:** <https://www.typescriptlang.org/docs/>
