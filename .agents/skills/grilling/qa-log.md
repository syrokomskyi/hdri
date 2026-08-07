# Q&A Log (L0)

Append-only log of questions asked and answers given during grilling sessions. Used for meta-analysis to distill recurring decision patterns.

<!-- Entries are appended by the skill during each run. -->
<!-- Format:
## <date> — <context>
- **Question:** <short question summary>
- **Answer:** <operator's decision>
-->

## 2026-08-02 — HDRI, подготовка к квартальному срезу Q3

- **Question:** Как пополнять источники и изолировать результаты кварталов?
- **Answer:** Новая папка квартала содержит только новые источники; они могут повторять уже известные сайты. Весь ранее принятый материал сохраняется. Каждый квартал получает собственную неизменяемую капсулу. Старые собранные данные нельзя терять или изменять, но код можно переписать вперёд без обратной совместимости и без сохранения легаси-веток.

## 2026-08-03 — HDRI test coverage RFC

- **Question:** RFC или сразу тесты?
- **Answer:** RFC, потому что из 5 пробелов как минимум 2 могут потребовать production-изменений (registry_alias мёртвый код, classifyError баги).
- **Question:** Объём RFC — что входит?
- **Answer:** Всё в одном RFC: page-helpers, upsertLighthouse/upsertAxe, classifyError/checkSiteLiveness, migration idempotency, registry_alias решение.

## 2026-08-04 — RFC-0049 plan grilling

- **Question:** Stale row cleanup: pg-boss scheduled job vs worker startup method?
- **Answer:** pg-boss scheduled job — aligns with existing infrastructure, runs automatically daily.
- **Question:** rateGate wiring: OrchestratorDependencies only vs also adding to RunActiveMethodologiesInput?
- **Answer:** OrchestratorDependencies only — minimal change, callers that already construct deps pass it.
- **Question:** Driver wiring scope: orchestrator drivers only (Playwright + Crawlee) vs all four drivers everywhere?
- **Answer:** Orchestrator drivers only — LiveHttpCaptureTransport and BrowsertrixRecorder already accept rateGate? in constructors, callers can pass when needed.
- **Question:** Benchmark acceptance criterion: skip in unit tests vs include with real PostgreSQL?
- **Answer:** Include benchmark step with real PostgreSQL — skip if AXIOM_DATABASE_URL not set.

## 2026-08-04 — RFC-0061 enhance + plan grilling

- **Question:** RFC утверждает что все тиры делают 2 вызова, но код уже делает 1 вызов для high и light. Исправить факты?
- **Answer:** Исправить факты — только medium делает 2 вызова. Убрать claim про high tier retaining 2-call pattern.
- **Question:** Какая модель для single call: finalEdit (luna) или authoritativeFinalization (deepseek)?
- **Answer:** finalEdit модель — это модель которая сейчас пишет финальный отчёт. Менее рискованно для качества.
- **Question:** Как определить max context модели для guard: добавить contextWindow в registry, константа, или убрать guard?
- **Answer:** Добавить contextWindow в ModelRegistryEntry — точно, требует обновления registry.
- **Question:** RFC-0060 ещё draft или реализован?
- **Answer:** RFC-0060 реализован. Продолжаем.
- **Question:** Tier-based логика или использовать существующий model-match skip?
- **Answer:** Tier-based логика — явная проверка с context window guard. Заменяет существующую model-comparison логику.
- **Question:** Какой промпт для single call: call 1 промпт + finalEdit модель, или новый гибрид?
- **Answer:** Новый гибридный промпт — гибрид call 1 и call 2.
- **Question:** Объединить шаги 3+4 плана (tier-based логика + context window guard)?
- **Answer:** Объединить — это одна правка того же файла.
