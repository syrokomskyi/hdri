[[agentic-video-system-architecture-v0.2]]

# Представим, что мы хотим создать такую систему - платформу разработки видео произведений. Поработаем сейчас над тем, на каком стеке это лучше реализовать. Интересует технологический стек.

---

Собрал рекомендацию по технологическому стеку с учётом архитектуры из вашего документа  и вашего текущего окружения (TypeScript, Cloudflare, Ubuntu/LXC).

Ключевая логика выбора:

- **Story Graph** → PostgreSQL + pgvector: один движок хранит и записи Entity/Fact/Scene, и эмбеддинги для identity-гейтов, без отдельного вектор-сервиса.
- **Синхронизация параллельных агентов** → Yjs, а не Automerge: документ требует именно то, что Yjs делает быстрее и легче (реестр merge-стратегий по типу записи), а git-подобная история уже покрыта вашей моделью Provenance/revision/supersedes, так что тяжёлый WASM-overhead Automerge не оправдан.
- **Timeline DSL** → OpenTimelineIO как Python-sidecar в LXC-контейнере, а не порт на TS — документ явно требует строить DSL на индустриальном стандарте, а не изобретать заново.
- **Рендер T0-T1** → Remotion (React + headless Chromium) — прямое TS-native попадание в модель "DOM/CSS как один из рендереров", тот же паттерн, что у Editframe, только на вашем стеке.
- **Рендер T2-T3** → тот же Remotion, но с GPU (Chrome for Testing) на выделенных Ubuntu-серверах — **Cloudflare Workers физически не годятся** для видеорендера (128 МБ памяти на изолят, 5 минут CPU, нет сабпроцессов), так что рендер-нагрузка уходит на вашу существующую LXC-инфраструктуру, а Cloudflare остаётся для edge/API/R2/Queues.
- **Оркестрация пайплайна** → Temporal — durable execution с human-in-the-loop как первоклассным примитивом, что напрямую соответствует циклу propose→diff→confirm и каскадам intent-taxonomy из документа.

Полный отчёт со сравнительными таблицами и обоснованием каждого решения — ниже.

---

## Отправная точка

Архитектурный документ  описывает систему из двух графов — **Story Graph** (семантика: Entity/Fact/Scene/Constraint) и **Production Graph IR** (типизированные узлы, рендер) — с семейством DSL по образцу страниц DaVinci Resolve (Timeline≈Edit/Cut на базе OpenTimelineIO, Node/Compositing в духе OpenFX, Color на ACES, Audio в духе Web Audio API) и fidelity-тирами T0→T3. Учитывая профиль стека заказчика — TypeScript, Cloudflare Workers, Astro, Ubuntu/LXC, AI-агенты в CI/CD — ниже подобран стек, максимально совместимый с этим окружением, с точечными обоснованными исключениями там, где Cloudflare Workers физически не подходят.[1]

## Общая архитектура слоёв

| Слой | Назначение | Технология |
|---|---|---|
| Story Graph API | CRUD/патчи по Entity/Fact/Scene | TypeScript + Postgres (Neon/Supabase) |
| Realtime co-editing | Lease + optimistic commit, слияние правок агентов | Yjs (CRDT) |
| Production Graph IR | Типизированные узлы, компиляция DSL | TypeScript, кодогенерация схем через Zod |
| Timeline DSL | Монтаж/резка | OpenTimelineIO (Python-биндинг, вызывается как sidecar) |
| Рендер T0-T1 | Раскадровка/previs, дёшево | Remotion (React + headless Chromium) |
| Рендер T2-T3 | Финальный грейд/compositing | Node.js worker + FFmpeg + GPU-инстанс |
| Оркестрация пайплайна | Пять стадий бриф→T0, эскалации фидбека | Temporal |
| Векторный поиск (эмбеддинги идентичности) | face/voice embedding compare | pgvector в той же Postgres |
| Очереди/файлы | Ассеты, рендер-джобы | Cloudflare R2 + Queues, либо S3-совместимое хранилище |
| Фронтенд оператора | Таймлайн, пины, disambiguation-виджет | Astro + React island, TypeScript |
| Аутентификация/consent | consentScope, IdentityModel gate | Cloudflare Access / собственный сервис |

## Story Graph: хранение и синхронизация

Story Graph описан как набор независимо адресуемых записей с полями `provenance`, `revision`, `supersedes` — это классическая модель append-only событий поверх реляционной БД. Postgres с расширением pgvector закрывает и хранение Entity/Fact/Scene, и векторное сравнение face/voice эмбеддингов для identity-гейтов в одном месте без отдельного вектор-сервиса — pgvector остаётся операционно самым дёшевым вариантом до 10-50 млн векторов, что для этой системы (эмбеддинги на персонажа, не на кадр) более чем достаточно.[2][3]

Для параллельной записи агентов в общий граф документ явно требует "lease + optimistic commit с реестром merge-стратегий по типу записи" — разные стратегии (OR-Set, LWW-Register, RGA/fractional-index, exclusive lease) на разные типы полей. Из существующих CRDT-библиотек для этого профиля лучше подходит **Yjs**: она заметно быстрее Automerge (в 10-50 раз на больших документах в бенчмарках), даёт первоклассные типы (Y.Map, Y.Array, Y.Text) под каждую merge-стратегию и легче встраивается в TypeScript-стек без WASM-накладных расходов. Автогенерация `optimistic commit` через revision-check (как в примере `commit()` из документа ) реализуется поверх Yjs-транзакций плюс отдельная таблица lease с TTL в Postgres.[4][5][6][1]

Automerge стоит рассматривать альтернативой только если продуктовым приоритетом становится git-подобная история изменений графа как самостоятельная фича — документ явно упоминает append-only Provenance как "бесплатное следствие", то есть история уже покрыта на уровне схемы данных, и дополнительный overhead Automerge (WASM, 3-5x памяти) не оправдан.[7][8]

## Production Graph IR и DSL-семейство

Каждый DSL в документе явно привязан к существующему индустриальному стандарту, и для большинства есть готовые TypeScript/Python реализации:

| DSL | Стандарт | Готовая реализация |
|---|---|---|
| Timeline | OpenTimelineIO | `opentimelineio` (Python, PyPI), запускается как sidecar-сервис или через WASM-порт |
| Node/Compositing | реестр типов узлов в духе OpenFX | Собственный TS-реестр (Zod-схемы портов + референсная реализация на узел) |
| Color | ACES | vips/OpenColorIO CLI, вызывается из рендер-воркера |
| Motion/Curve | CSS @keyframes фасад | Framer Motion / чистый CSS внутри Remotion-компонентов |
| Audio | граф шин в духе Web Audio API | Web Audio API нативно в браузере рендера, либо Tone.js на сервере |
| Delivery/Compliance | DeliveryProfile валидация | Собственная TS-валидация против JSON Schema профиля |

OpenTimelineIO официально поддерживает Python (VFX Platform 2020-2023) с публичным PyPI-пакетом, C++ ядром и плагинной системой адаптеров. Поскольку основной стек — TypeScript, разумный паттерн: держать OTIO как выделенный Python-микросервис (в LXC-контейнере на существующей Ubuntu-инфраструктуре пользователя) с тонким HTTP/gRPC интерфейсом, а не пытаться портировать OTIO на TS.[9][10][11]

## Рендер-субстрат: почему Remotion, а не «чистый» Editframe-подход

Документ явно фиксирует: "DOM/CSS остаётся ОДНИМ из рендереров — честным, для layout и простого 2D-композитинга", рендерящимся покадрово в headless Chromium — именно эту модель реализует **Remotion**: React-компоненты описывают сцену, движок рендерит кадр за кадром через Chromium и склеивает через FFmpeg, с локальным CLI и serverless-деплоем на AWS Lambda. Это прямое попадание в TypeScript-стек пользователя и совпадает с планом T0-рендера из документа (`ef-text`/`ef-image`/`ef-captions`/`ef-audio` поверх `EF_RENDER_DATA` — Remotion даёт то же самое через props компонентов).[12]

Remotion поддерживает два режима headless-браузера — Chrome Headless Shell (быстрее для CPU-bound рендера, меньше зависимостей) и Chrome for Testing (для GPU-ускоренного рендера). Для T0-T1 (раскадровка/previs, дёшево и часто) подходит Headless Shell на дешёвых CPU-инстансах; для T2-T3 (identity-рендер, финальный мастеринг) — Chrome for Testing с GPU на выделенных серверах, поскольку document явно выделяет T2/T3 как "точку, где рендер касается конкретных прав" и требует высокого разрешения (4K, 50 steps).[13][14][15][16]

Критически важно: **Cloudflare Workers не подходят как площадка для самого видеорендера**. V8-изоляты не могут спавнить сабпроцессы или запускать нативный FFmpeg; WASM-порт ffmpeg.wasm ограничен 128 МБ памяти на изолят, 5 минутами CPU-времени и не поддерживает многопоточность — типичный 1080p-клип в 100-500 МБ уже превышает лимит памяти. Cloudflare остаётся идеальным для оркестрации фронтенда (Astro), API edge-слоя, R2-хранилища ассетов и Queues для джобов, но фактический рендер (T0-T3, включая Three.js-сцены на T1 и FinalLikeness на T3) должен идти на выделенных Ubuntu/LXC-воркерах — что прямо соответствует существующей DevOps-практике пользователя с контейнерами.[17]

## Оркестрация пайплайна и агентов

Пайплайн "бриф → структура → beats → сцены → проверка+скелет → T0-рендер" и последующий каскад T0→T1→T2→T3 с гейтами (`consentScope`, `identityFidelity`, `deliverableCompliance`) — это классический сценарий для durable execution: длительные (недели, по видению документа), многошаговые, с человеком-в-цикле на каждом confirm/reject.

**Temporal** здесь подходит лучше alternatives типа LangGraph или чистого cron/queue-подхода: он даёт durable execution через event sourcing (каждый шаг workflow персистится, реплеится при сбое воркера), первоклассный примитив human-in-the-loop (нужен для цикла propose→diff→confirm из документа) и явно рекомендован для сценариев "mission-critical, long-running (часы-дни), высокая цена потери state". В 2026 Temporal добавил Standalone Activities и интеграции с Google ADK/OpenAI Agents SDK, что упрощает встраивание LLM-агентов как Activities с автоматическими ретраями. Паттерн "Temporal как внешний контур, LangGraph как внутренний" уместен, если отдельные агенты (например, триаж-агент фидбека) нуждаются в сложном ветвлении решений внутри одного шага.[18][19][20][21][22]

Каскадные правила из таблицы intent-taxonomy документа (pacing→ре-тайминг сцены, identity→каскад на все сцены персонажа, mastering→ре-триггер GlobalPass) реализуются как Temporal Signals/Queries, направленные на конкретный Workflow ID сцены или персонажа — естественное соответствие модели документа "blast radius определяет taxonomy".

## Итоговый рекомендуемый стек

| Компонент | Технология | Причина выбора |
|---|---|---|
| Язык платформы | TypeScript (Node.js) | Совпадает с текущим стеком, единая типизация Story Graph/Production Graph IR |
| Story Graph БД | PostgreSQL + pgvector | ACID, единое хранилище графа и identity-эмбеддингов[3][23] |
| CRDT-синхронизация агентов | Yjs | Производительность и экосистема под TS, легче Automerge[4][6] |
| Timeline DSL | OpenTimelineIO (Python sidecar) | Индустриальный стандарт, прямое требование документа[11][10] |
| Рендер T0-T1 | Remotion + Chrome Headless Shell | Дёшево, TS-native, тот же паттерн что Editframe[12][13] |
| Рендер T2-T3 | Remotion + Chrome for Testing (GPU) + FFmpeg | GPU-ускорение, финальное качество[14][16] |
| Оркестрация пайплайна | Temporal | Durable execution, human-in-the-loop, долгие workflow[19][22] |
| Хранилище ассетов | Cloudflare R2 + Queues | Совпадает с текущей Cloudflare-инфраструктурой |
| Инфраструктура рендер-воркеров | Ubuntu + LXC/Docker, GPU-инстансы | Прямое расширение текущей DevOps-практики |
| Фронтенд оператора | Astro + React island | Совпадает с текущим стеком, легковесный edge-фронтенд |

Эта комбинация даёт разделение ответственности, зафиксированное в документе: Cloudflare-слой обслуживает edge/API/фронтенд (уже знакомая пользователю зона), Ubuntu/LXC-слой — тяжёлый headless-рендер и Temporal-воркеры (естественное расширение текущего DevOps-опыта), а TypeScript остаётся сквозным языком для Story Graph, Production Graph IR и большинства сервисов, за исключением OpenTimelineIO, который целесообразно изолировать как отдельный Python-сервис, а не портировать.
