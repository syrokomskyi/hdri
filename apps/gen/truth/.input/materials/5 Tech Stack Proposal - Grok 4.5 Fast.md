[[agentic-video-system-architecture-v0.2]]

# Представим, что мы хотим создать такую систему - платформу разработки видео произведений. Поработаем сейчас над тем, на каком стеке это лучше реализовать. Интересует технологический стек.

---

**Рекомендуемый технологический стек** для агентной системы создания видео (по архитектуре из документа: два графа, fidelity-тиры T0–T3, точечный фидбек оператора, параллельные агенты с lease + optimistic commit, identity/consent, рост от explainer-роликов до полнометражных фильмов).

Стек спроектирован так, чтобы простой случай (минутные бизнес-explainer’ы) получался «бесплатно», а сложность наращивалась без переписывания ядра.

### 1. Ядро данных и графы

| Компонент | Рекомендация | Почему |
|-----------|--------------|--------|
| **Story Graph** | PostgreSQL + JSONB + pgvector (+ опционально Apache AGE или Neo4j) | Provenance, revision/supersedes, StoryTime (fractional-index), leases, optimistic concurrency — всё естественно ложится на Postgres (MVCC, advisory locks, `SELECT FOR UPDATE SKIP LOCKED`). pgvector — для identity embeddings. Для сложных multi-hop continuity-запросов позже можно добавить graph-слой. |
| **Production Graph IR** | Собственная типизированная модель узлов с портами (TypeScript/Python) + сериализация в JSON / protobuf | Версионируемые узлы, реестр типов (как OpenFX). Не DOM. |
| **Timeline DSL** | OpenTimelineIO (Python + C++ bindings) | Индустриальный стандарт (Pixar/ASWF), идеально соответствует «Timeline ≈ страница Edit/Cut в Resolve». |
| **Версионирование / event sourcing** | Append-only журнал патчей + materialised current state | Прямо следует из Provenance + supersedes. Восстановление после сбоя — «бесплатно». |

### 2. Агенты и оркестрация

- **Фреймворк агентов**: LangGraph (основной) + deepagents / CrewAI-стиль для hierarchical (Director → Scene Builders).  
  Хорошо ложится на stateful graph + checkpointing в Postgres.
- **LLM-слой**: Claude / GPT / Gemini / Grok + локальные модели через vLLM/Ollama для дешёвых стадий. Tool-calling + MCP-серверы для инструментов (рендер, continuity-check, identity).
- **Параллелизм и конфликты**:  
  - Soft leases с TTL + optimistic concurrency check при commit (как в документе).  
  - Реестр merge-стратегий по типу записи (OR-Set для Fact.list, LWW для voice, RGA/fractional-index для порядка, exclusive lease для активной генерации Scene.script, recompute для ContinuityConstraint).
- **Оркестрация долгих задач**: Temporal или Prefect / Airflow. Для render farm — Kubernetes jobs + content-addressed кэш.

### 3. Рендеринг и fidelity-тиры

| Тир | Технология | Комментарий |
|-----|------------|-----------|
| **T0 (раскадровка)** | HyperFrames (рекомендуется) или Editframe / html-video | HTML/CSS + data-атрибуты → headless Chromium (Puppeteer/Playwright) + FFmpeg. Agent-native, детерминированный, Apache-2.0. Именно то, что документ называет «то, что Editframe уже делает сегодня». |
| **T1 (previs)** | Тот же Chromium + Three.js (generic rigged mesh) + простые Camera/position curves | Рендер-субстрат не меняется. |
| **T2/T3** | Генеративные модели (Veo, Kling, Runway, Sora и т.д.) + IdentityModel (embeddings) + ACES color + GlobalPass | Identity gate по `consentScope` + `status == "locked"`. Для color/mastering — OpenColorIO / ACES. |
| **Compositing / Node** | Реестр узлов в духе OpenFX + собственный DAG-executor (или интеграция с Blender/Nuke позже) | Не пытаться «докрутить DOM до Fusion-grade DAG». |
| **Audio** | Web Audio-подобный граф + loudness constraints (LUFS) + ElevenLabs / Cartesia / локальный TTS | |
| **Финал** | FFmpeg + OpenTimelineIO export + DeliveryProfile validation | |

**Почему не только Remotion**: Remotion отличен для React-команд, но HTML-native (HyperFrames) значительно дружелюбнее к LLM-агентам и проще для agent handoff. Можно держать оба рендерера за единым `Production Graph IR` интерфейсом.

### 4. Frontend оператора (точечный фидбек)

- **Стек**: Next.js / React + TypeScript.
- **UI**: Кастомный timeline + filmstrip + пины (timecode / node / entity / cross-scene / global).  
  Intent taxonomy (pacing, wording, visual, structural, narrative, continuity, compliance, tone-global, identity, mastering) → triage-агент → proposedPatch + дешёвый preview.
- **Реал-тайм**: WebSocket / LiveKit (если нужен голос).
- **Мокап** уже описан в документе — его стоит реализовать первым.

### 5. Инфраструктура и вспомогательные сервисы

- **Хранилище медиа**: S3-совместимое (MinIO / AWS S3 / Cloudflare R2) + content-addressed кэш.
- **Векторный поиск / identity**: pgvector (в начале) → Qdrant / Weaviate при росте.
- **Очереди и jobs**: Redis + Temporal / Celery / BullMQ.
- **Observability**: Langfuse / LangSmith + OpenTelemetry + Grafana.
- **Deployment**: Docker + Kubernetes (render workers масштабируются отдельно от agent workers).
- **CI/CD и воспроизводимость**: детерминированный рендер (seek, а не play) — критично для тестов.

### 6. Практический план старта (строго по документу)

1. Минимальная **Story Graph** схема (даже для одной сцены) с `consentScope` и `voice.persona` с первого дня.
2. **Fidelity как ось узла** — сразу два тира (draft/final), потом расширять до T0–T3.
3. Continuity-checker как отдельный вызываемый инструмент (3–5 правил).
4. T0-рендер на HyperFrames / Editframe без новой инфраструктуры.
5. Feedback UI с propose → cheap preview → confirm.
6. Только потом — параллельные агенты, GlobalPass, identity models, generative T2/T3.

### Ключевые принципы стека (отражают сквозные принципы документа)

- **Реестр вместо спецкейсов** — node-типы, presets, merge-стратегии, fact-схемы, filler’ы.
- **Патч, а не перегенерация** — стабильные ID везде.
- **Закрытое ядро, открытая периферия** (роли DSL маленькие и стабильные, filler’ы/presets/node-типы — через реестр).
- **Дешёвая проверка перед дорогим шагом**.
- **Кандидаты, а не единственный ответ** там, где есть вкус (блокинг, архетипы).

### Альтернативы и trade-offs

- **Чисто Python-стек** (если команда сильнее в data/AI): FastAPI + LangGraph + MoviePy/HyperFrames-python bindings + Postgres. Frontend отдельно.
- **Максимально agent-native и open-source**: HyperFrames + LangGraph + Postgres + Temporal + OpenTimelineIO.
- **Если команда уже глубоко в React**: Remotion как один из рендереров + тот же IR.
- **Не стоит**: пытаться строить всё на одном DOM/CSS (документ явно предупреждает), или начинать с полнометражного пайплайна.

Этот стек напрямую поддерживает мастер-схему из документа (Оператор → Агент → Story Graph → компиляция через shotIntent → Production Graph IR → Fidelity Tier → дешёвый preview) и позволяет расти без переписывания ядра.
