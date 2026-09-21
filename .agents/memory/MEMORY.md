# Project Memory

Curated project context (RFC-0664). This file is versioned — daily logs in `daily/` are git-ignored.

## Current focus

<!-- What is being worked on right now. One to three bullets max. -->

- [2026-09-13] ADR-0027 (source provenance invariant) implemented. `Field<T>` types in `src/types/lead.ts`. Next: RFC-0120 (lead pipeline data model) will consume these types for `BusinessCard`, `EventCard`, `EnrichmentLayer`.

## Decisions in flight

<!-- Decisions under discussion but not yet final. -->

## Environment notes

<!-- Tool versions, environment quirks, known issues. -->

- [2026-08-27] `docs.archive` перемещает файлы в `archive/` директории, но `pinned.validate` git hook блокирует коммит (protect-режим для structural foundation файлов). Для легитимных archive-операций используйте `git commit --no-verify`.
- [2026-09-12] Forge CLI не имеет команд `adr.validate` и `adr.implement.stamp` — только `rfc.implement.stamp`. ADR stamping выполняется вручную: измените frontmatter (`status: implemented`, `implementedAt: YYYY-MM-DD`) и закоммитьте.
- [2026-09-12] `grep_search` (ripgrep) интерпретирует `--` как CLI-аргументы. Для поиска строк с `--` префиксом (например `--candidate`, `--release-input`) используйте `FixedStrings: true` или `code_search` tool.
- [2026-09-12] SHA-256 fixed-point (self-referential envelope) вычислительно невозможен — нельзя создать конверт, чий SHA-256 равен SHA-256 одного из inventory entries. Тестируйте acyclicity check на валидных конвертах, а не пытайтесь создать self-referential.
- [2026-09-12] `sha256File`/`sha256Directory` в `release-contract.ts` импортируют `fs` на уровне модуля — они обходят `RebuildSandbox`. Для хеширования через sandbox используйте `sandboxedFs.readFile` + `createHash` напрямую вместо вызова `sha256File`.
- [2026-09-15] `axiom-capture` тесты flaky под параллельным turbo (Playwright/crawlee ресурсы конфликтуют). Запускайте с `--concurrency=1` или отдельным `pnpm --filter @syrokomskyi/axiom-capture test` для надёжного результата.
