[[agentic-video-system-architecture-v0.2]]

# Представим, что мы хотим создать такую систему - платформу разработки видео произведений. Поработаем сейчас над тем, на каком стеке это лучше реализовать. Интересует технологический стек.

---

Собрал картину: проект из черновика v0.2 (два графа, семейство DSL, тиры T0–T3, агенты с lease/OCC) ложится на TypeScript-ядро с event-sourced Postgres, Temporal-оркестрацией и тремя разными рендер-субстратами по тирам. Ниже — стек по слоям с обоснованием.

## Стек по слоям

| Слой | Рекомендация | Почему |
|---|---|---|
| Язык ядра | TypeScript (Node 22+), pnpm-монорепо | Схемы документа уже написаны на TS  |
| IR и схемы | Zod → JSON Schema, semver | Типизированный версионируемый Production Graph IR  |
| DSL | Langium (LSP из коробки) или Chevrotain | Машиночитаемые ошибки до рендера |
| Story Graph | Postgres 16, JSONB + append-only журнал | Provenance/revision нативно  |
| Эмбеддинги | pgvector | Калибровка identityFidelity-порогов |
| Оркестрация | Temporal (TypeScript SDK), self-hosted | Signals = цикл propose→diff→confirm |
| Агенты | Claude Agent SDK / Vercel AI SDK + MCP-сервер | Agent-native позиционирование |
| T0-рендер | HyperFrames или Remotion (headless Chromium) | Готовый детерминированный HTML→MP4 |
| T1-рендер | Three.js в том же Chromium | Previs и блокинг  |
| T2/T3-рендер | ComfyUI headless + InsightFace/XTTS | Его node-graph ≈ ваш IR |
| Финишинг | ffmpeg + OpenColorIO (ACES) | LUFS/dBTP, colorSpace, delivery |
| Фронтенд | Astro + React-острова, Yjs | Ваш текущий стек |
| Медиа и кэш | Cloudflare R2 (EU-регион), content-addressed | Инкрементальный re-render |
| GPU | RunPod/Modal на старте → свой узел | Экономика burst-нагрузки |
| Наблюдаемость | SigNoz + Prometheus + Langfuse | Трейсы агентов и рендеров |

## Ядро: TypeScript, IR и DSL

Главное решение — один язык от схем до рендер-фасадов. Python появляется только как изолированный sidecar там, где без него никак (ComfyUI, OpenColorIO, Whisper). Контрактом между слоями служит сериализуемый JSON IR: поверхностные DSL (Timeline, Node, Color, Audio) компилируются в него, и только IR видят рендереры. Это прямо реализует принцип «реестр вместо спецкейсов» из документа: новый node-тип — это пакет с JSON Schema параметров, типами портов и референсной реализацией, а не ветка в компиляторе.

Для грамматик DSL берите Langium: он генерирует парсер и LSP-сервер, так что агенты и люди получают автодополнение и валидацию портов до рендера — именно тот `validate ports` на стадии компиляции, который заложен в пайплайн. Для крошечной грамматики shotIntent хватит и Chevrotain. Пресеты храните как записи в БД (макро-расширение до парсинга) — тогда «новый пресет из существующих филлеров» действительно становится строкой в таблице с нулём кода.

## Хранение: Story Graph и конкурентность

Postgres закрывает всё, что описано в разделе о параллелизме агентов, без лишней инфраструктуры:

- Таблицы по типам записей (Entity, Fact, Scene, ContinuityConstraint) с JSONB-payload и колонками `id`, `revision`, `supersedes` — функция `commit()` из документа становится одной SQL-транзакцией с проверкой revision, то есть OCC из коробки.
- Append-only журнал патчей даёт бесплатное восстановление состояния — то самое «бесплатное следствие Provenance».
- Lease — таблица с `expiresAt` плюс периодическая очистка, либо `pg_advisory_lock` для коротких захватов.
- pgvector хранит face/voice-эмбеддинги и калибровочные выборки персонажей проекта для compareEmbedding.
- Yjs подключайте только для живой сессии оператора (таймлайн, пины); реестр merge-стратегий остаётся на уровне приложения, потому что CRDT смысловые конфликты всё равно не решает.

Медиа и content-addressed кэш — в R2: ключ `sha256(nodeId + params + tier + modelVersion)`. Это даёт дешёвый инкрементальный re-render, а напряжение с GlobalPass (пересчёт окрестности anchor'ов) остаётся эвристикой уровня приложения, как и честно зафиксировано в документе.

## Рендер по тирам T0–T3

**T0.** Готовых детерминированных пути два. HyperFrames от HeyGen — Apache 2.0, agent-native (data-атрибуты для тайминга, headless Chrome + FFmpeg, CLI и skills для агентов, рендер локально, на AWS Lambda или Cloud Run). Remotion — зрелый серверный рендер на Node.js/Bun и распределённый рендер через `@remotion/lambda`. Оба прячьте за фасадом «DOM-рендерер» как одним из бэкендов IR — ровно как документ оставляет DOM честным рендерером для layout и простого 2D. TTS для T0: ElevenLabs API или self-hosted XTTSv2/Piper.

**T1.** Three.js в том же headless Chromium: generic rigged mesh, position-кривые в scene-space, rule-based камера по прецеденту Cinemachine. Рендер-субстрат не меняется — меняется только filler узла.

**T2/T3.** Здесь субстрат — ComfyUI как headless-сервер: workflow экспортируется как API-JSON, отправляется POST'ом на `/prompt`, прогресс приходит по WebSocket. Его граф узлов с портами — почти один в один ваш Production Graph IR, так что компилятор Node-DSL может генерировать ComfyUI-граф напрямую. Продакшн-практики известны: версионируйте workflow-шаблоны, валидируйте параметры на границе, пиньте модели по хэшу и прикрепляйте repro-метаданные к каждому артефакту  — это прямо ложится на ваш Provenance. Поверх: InstantID/PuLID-класс моделей для лика, InsightFace-эмбеддинги для identityFidelity-check, XTTSv2/F5-TTS для голоса, LatentSync/Wav2Lip для lip-sync; видеодиффузия — open-weights (Wan, LTX-Video, HunyuanVideo) на своём GPU или внешние API (Veo, Runway, Kling) за тем же интерфейсом узла. [docs.comfy](https://docs.comfy.org/development/comfyui-server/comms_overview)

**Финишинг.** ffmpeg (двухпроходный loudnorm под EBU R128, `ebur128` для QC, x264/AV1), OpenColorIO с ACES-конфигами через Python-sidecar. Учтите: у OpenTimelineIO нет зрелого JS-биндинга (это Python/C++ библиотека), поэтому либо sidecar для импорта/экспорта OTIO, либо своё TS-подмножество Timeline DSL с маппингом на OTIO как interchange-формат.

## Оркестрация, UI и инфраструктура

Temporal с TypeScript SDK — почти идеальное попадание в модель документа: durable workflow живёт неделями (ваш «фильм за неделю-две»), а Signals с `condition` реализуют блокирующее ожидание approve/reject от оператора — задокументированный approval pattern. Есть и готовый учебный паттерн «MCP-инструменты поверх Temporal с human-in-the-loop». Сами инструменты системы (continuity-checker, patch-proposer, render-submit) экспонируйте как MCP-сервер — это тот же agent-native ход, что llms.txt у Editframe. Если хотите остаться полностью в Cloudflare, альтернатива — Workflows + Queues, но для недельных рендеров и self-hosting на ваших LXC Temporal органичнее.

Остальное коротко:

- UI оператора: Astro + React-острова, таймлайн на canvas, wavesurfer.js для аудио, realtime через Yjs поверх Durable Objects; голосовой фидбек → faster-whisper → `rawUtterance`.
- Инфраструктура: Docker внутри ваших Ubuntu LXC (Postgres, Temporal, MinIO при желании локального S3), GPU сначала на RunPod/Modal, позже — свой узел; CI на GitHub Actions; SigNoz/Prometheus для сервисов и Langfuse для трейсов LLM-агентов.
- GDPR-момент, который нельзя откладывать: `consentScope` и IdentityModel — это биометрия по ст. 9 GDPR. Держите эмбеддинги и referenceMedia в EU (R2 EU-jurisdiction), считайте эмбеддинги self-hosted моделями и заключайте DPA с любыми внешними LLM/видео-API.

Старт под explainer-кейс GPU не требует: Postgres со схемами из документа, Timeline DSL v1, HyperFrames/Remotion для T0, ffmpeg для мукса, TTS, R2, Temporal (или BullMQ на первые недели) и Astro-экран фидбека с пинами — это ровно «практический план старта» из документа, переведённый в конкретные пакеты. Могу следующим шагом расписать структуру монорепо (пакеты `ir`, `dsl-*`, `story-graph`, `render-*`, `agent-tools`) или собрать ADR по выбору HyperFrames vs Remotion.
