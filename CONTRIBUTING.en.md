# Contributing

> [Deutsche Version](CONTRIBUTING.md)

Thank you for your interest in contributing to the Handwerk Digital Readiness Index (HDRI). Contributions are welcome at every level — from correcting a typo to integrating a new data source.

## How to contribute

### 1. Report a bug or suggest an improvement

- Open a [GitHub Issue](https://github.com/syrokomskyi/hdri/issues).
- Describe the problem as precisely as possible. For bugs: steps to reproduce, expected vs. actual behaviour, environment (Node.js version, operating system).
- For methodology proposals: include scientific references or legal grounds.

Please read the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) before contributing.

### 2. Code contribution (Pull Request)

1. **Fork** the repository.
2. **Create a branch** for your change: `git checkout -b feature/your-description`.
3. **Edit** the code. Follow the existing architecture:
   - New gogols in `apps/<app>/run/gogols/`
   - Shared logic in `packages/*`
   - No external dependencies outside the monorepo without prior discussion
4. **Test** your change:
   ```bash
   pnpm turbo run typecheck
   pnpm turbo run build
   ```
5. **Commit** with a descriptive message in English or German.
6. **Open a Pull Request** including:
   - Description of the change
   - Rationale (why it is needed)
   - Tests you have run

### 3. Translation

Documentation should be available in German and English. If you contribute a translation:

- Create `.en.md` files parallel to existing `.md` files.
- Add a language-switcher link in both files (see existing READMEs as a template).
- Do not translate machine-generated YAML/JSON examples — keep German technical terminology.

### 4. Propose a new data source

If you would like to contribute a new catalog (CSV, HTML) for the factory pipeline:

- Open an issue with:
  - Name and provenance of the source
  - Privacy notice (does the source contain personal data?)
  - Sample dataset (5–10 anonymised rows)
  - Licence or terms of use of the source
- We will assess whether the source can be integrated into the existing pipeline.

## Code style

- TypeScript, strict mode
- 2 spaces indentation
- `??` instead of `||` for nullish coalescing
- `satisfies` for configs and constant tables
- `override` on class inheritance
- Comments only where explanation improves maintainability

## Licence

By submitting a contribution, you agree that your contribution will be released under the [Apache License 2.0](LICENSE).
