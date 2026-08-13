[[agentic-video-system-architecture-v0.2]]

# Представим, что мы хотим создать такую систему - платформу разработки видео произведений. Поработаем сейчас над тем, на каком стеке это лучше реализовать. Интересует технологический стек.

---

Да. И здесь я бы **не выбирал стек как для обычного SaaS**. Архитектура из документа уже диктует технологическое разделение: Story Graph и Production Graph IR — разные сущности; Production Graph должен быть типизированным и версионируемым, а DOM/HTML — только одним из рендереров. 

Из этого следует довольно конкретный стек.

## Моя базовая рекомендация

Я бы строил систему вокруг **трёх основных языков**:

**Rust + TypeScript + Python.**

Не больше.

```text
                         ┌─────────────────────────────┐
                         │     Studio / Operator UI    │
                         │ React + TypeScript          │
                         └──────────────┬──────────────┘
                                        │
                               HTTP / SSE / WS
                                        │
                  ┌─────────────────────▼─────────────────────┐
                  │              CONTROL PLANE                │
                  │ TypeScript / Node                         │
                  │ API + Temporal workflows + Agents         │
                  └─────────────┬─────────────────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
    PostgreSQL              Object Store        Model Workers
 Story/metadata/patches      S3 / R2             Python
           │                    │                AI / TTS /
           │                    │                image/video
           └────────────┬───────┘
                        │
                        ▼
              ┌────────────────────┐
              │    ENGINE CORE     │
              │       RUST         │
              │                    │
              │ IR                 │
              │ DSL compiler       │
              │ validators         │
              │ graph algorithms   │
              │ cache planner      │
              │ render planner     │
              └─────────┬──────────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
 Browser Renderer               Native Renderer
 Chromium                       Rust + wgpu
 SVG/Canvas/Three.js            FFmpeg
 FFmpeg                         OpenColorIO / ACES
 T0/T1                          T2/T3
```

Именно **Rust-ядро** я считаю главным техническим решением.

---

# 1. Ядро системы — Rust

Не TypeScript. Не Python.

В Rust должны жить:

* `Story Graph` domain model;
* `Production Graph IR`;
* система типов портов;
* node registry;
* compiler DSL → IR;
* IR validation;
* continuity-checker;
* dependency analysis;
* blast-radius calculation;
* patch validation;
* content-addressed dependency graph;
* render planner;
* cache keys;
* fidelity resolution `T0/T1/T2/T3`;
* DeliveryProfile validation;
* в дальнейшем — native compositor.

Почему это особенно подходит именно этой архитектуре: Production Graph в документе предполагает произвольный DAG, типизированные порты, стабильные ID и расширение через registry, а не через бесконечное разрастание грамматики. 

Это **компилятор и runtime**, а не CRUD-приложение.

И есть ещё одно важное преимущество: один Rust-код впоследствии можно использовать:

```text
Rust core
   ├── native Linux render worker
   ├── native desktop application
   ├── server
   └── WASM → browser
```

`wgpu` уже даёт Rust единый GPU API поверх Vulkan, Metal, D3D12 и WebGPU/WebGL в WASM. ([GitHub][1])

То есть позднее часть Production Graph можно исполнять **одним и тем же render engine как локально, так и в браузерном preview**.

Это чрезвычайно ценное свойство.

---

# 2. TypeScript — Control Plane и интерфейс

TypeScript я бы использовал для всего, что находится **вокруг** вычислительного ядра.

### Frontend

```text
React
TypeScript
Vite
Web Components / Canvas / WebGPU selectively
WebCodecs
```

React здесь нужен не ради сайта, а ради workstation UI:

* filmstrip;
* timeline;
* feedback pins;
* graph inspector;
* diff preview;
* asset browser;
* candidate comparisons;
* render status;
* approval gates;
* scene editor.

React сейчас остаётся активно развиваемой компонентной UI-платформой; актуальная официальная документация — ветка React 19. ([React][2])

Но само видео **не нужно строить как React component tree**.

React — UI оболочка.

---

# 3. WebCodecs + WebGPU — для интерактивного Studio

В браузере я бы постепенно уходил от модели:

> «перерисовать HTML → сделать screenshot»

к:

```text
assets
   ↓
WebCodecs
   ↓
VideoFrame
   ↓
WebGPU / Canvas
   ↓
preview
```

WebCodecs специально предоставляет браузерные интерфейсы непосредственного encode/decode аудио, видео и изображений. ([W3C][3])

WebGPU, в свою очередь, предоставляет браузеру GPU rendering/compute API. ([W3C][4])

Это открывает гораздо более интересный путь:

**Production Graph IR → browser preview renderer**

без необходимости представлять весь фильм DOM-деревом.

---

# 4. T0/T1: Chromium оставляем, но только как renderer plugin

Здесь я полностью согласен с архитектурным документом.

В нём T0/T1 специально предполагается дешёвым browser-based слоем; T1 уже может содержать Three.js proxy scene. 

Начальная реализация:

```text
Production Graph IR
        ↓
browser-render-plan
        ↓
Chromium
 ├─ HTML
 ├─ SVG
 ├─ Canvas
 └─ Three.js
        ↓
frames
        ↓
FFmpeg
```

### Конкретно

* Chromium;
* Playwright;
* SVG для diagram/text/layout;
* Canvas для некоторых effects;
* Three.js для T1 blocking/camera;
* FFmpeg для encode/mux/audio.

Playwright умеет программно управлять Chromium и захватывать frame/screenshot output. ([Playwright][5])

Three.js уже имеет полноценную animation infrastructure и WebGPU renderer. ([Three.js][6])

Но есть принципиальное ограничение:

> **никаких `HTMLElement` внутри Production Graph IR.**

Renderer получает IR и решает, как его реализовать.

---

# 5. T2/T3: собственный native compositor

Вот здесь начинается система, реально способная перерасти класс EditFrame/Remotion.

Я бы делал:

```text
Rust
+
wgpu
+
FFmpeg/libav*
+
OpenColorIO
+
ACES
```

### Разделение ответственности

**wgpu**

* compositing;
* transforms;
* masks;
* blend;
* shaders;
* blur;
* effects;
* image processing;
* GPU compute.

**FFmpeg**

* demux;
* decode;
* encode;
* codecs;
* audio/video filters;
* container output.

FFmpeg имеет развитый filter pipeline и поддержку аппаратного decode/encode. ([FFmpeg][7])

**OpenColorIO**

* color transforms;
* LUT;
* working/display spaces;
* ACES pipeline.

Актуальная OpenColorIO уже включает поддержку встроенных ACES 2.0 configurations. ([opencolorio.readthedocs.io][8])

То есть принцип из документа:

> scene-referred вместо CSS/display-referred

имеет совершенно практическое продолжение. 

---

# 6. OpenTimelineIO — да, но не как внутренний формат

Здесь я бы чуть уточнил исходный документ.

Он предлагает строить Timeline DSL на OpenTimelineIO. Это правильно как семантическая база. 

Но я **не делал бы OTIO каноническим Production Graph**.

OTIO официально позиционируется как API и interchange format именно для editorial cut information — современный аналог EDL. ([opentimelineio.readthedocs.io][9])

Поэтому:

```text
                     Production Graph IR
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
             OTIO         Resolve        Premiere/...
             export       adapter        adapter
```

А не:

```text
Production Graph = OTIO
```

Ваш IR должен быть богаче OTIO.

---

# 7. Каноническая схема IR — Protobuf

Это ещё одно решение, которое я бы принял сейчас.

Не делать единственным каноническим форматом огромный JSON.

Использовать:

```text
.proto schemas
       │
       ├── Rust types
       ├── TypeScript types
       └── Python types
```

Например:

```text
schemas/
  story/
    entity.proto
    character.proto
    fact.proto
    scene.proto

  production/
    graph.proto
    node.proto
    port.proto
    edge.proto
    curve.proto

  feedback/
    anchor.proto
    patch.proto

  render/
    render_plan.proto
    artifact.proto
    delivery_profile.proto
```

Protocol Buffers именно для этого и предназначен: language-neutral typed structured data с поддержкой эволюции схем и генерацией bindings для нескольких языков. ([Protocol Buffers][10])

### Но

Агенты не должны генерировать Protobuf.

У нас будет три представления:

```text
Human / Agent DSL
        ↓
       AST
        ↓
Production Graph IR      ← canonical semantics
        ↓
Protobuf / deterministic JSON
```

JSON projection нужен:

* агентам;
* debugging;
* diff;
* web inspector;
* logs.

Но **schema contract = Protobuf**.

---

# 8. DSL — Tree-sitter + Rust semantic compiler

Ваш DSL — одна из потенциально самых ценных частей системы.

Поэтому я бы не писал парсер через regexp или ручные `.split()`.

Стек:

```text
Tree-sitter
     ↓
Concrete Syntax Tree
     ↓
Rust semantic compiler
     ↓
typed Production Graph IR
```

Tree-sitter специально предназначен для incremental parsing и способен эффективно обновлять syntax tree после небольших изменений. ([Tree-sitter][11])

Это особенно подходит для будущего сценария:

> агент изменил три строки → система точно знает изменившийся syntax region → пересобирает затронутый IR → вычисляет blast radius.

При этом DSL остаётся удобным и человеку, и агенту.

---

# 9. PostgreSQL — и никакого Neo4j на первом этапе

То, что у нас называется **Story Graph**, не означает, что нам нужна graph database.

Я бы использовал PostgreSQL.

Примерно:

```text
story_records
-------------
id
project_id
type
revision
payload jsonb
supersedes_id
created_by
created_at

story_edges
-----------
from_id
relation
to_id
valid_from
valid_until

production_revisions
--------------------
scene_id
revision
ir_hash
object_key

patches
-------
id
base_revision
target_id
operations
status

feedback_items
leases
assets
renders
identity_models
```

PostgreSQL имеет богатую работу с `jsonb` и SQL/JSON. ([PostgreSQL][12])

Главное — **Story Graph физически хранить так же, как требует документ: независимо адресуемыми записями**, а не одним JSON-файлом. 

Neo4j можно добавить позже как read model, если реально окажутся нужны сложные graph traversal workloads.

Но делать его source of truth сейчас я бы не стал.

---

# 10. Assets — S3 API, content-addressed

Медиа вообще не должно жить в PostgreSQL.

```text
Postgres
  │
  │ AssetManifest
  ▼
S3-compatible object storage
  │
  ├── original
  ├── proxy
  ├── audio
  ├── embeddings
  ├── T0
  ├── T1
  ├── T2
  └── T3
```

Каждый asset:

```text
sha256
mediaType
size
duration
width
height
fps
colorSpace
audioLayout

source
generator
model
modelVersion
seed
parameters

parentAssets[]
rights
consent
```

Я бы использовал **S3 API как абстракцию**, а первой реализацией вполне может быть Cloudflare R2. На сегодня R2 предоставляет S3-compatible API. ([Cloudflare Docs][13])

Но код не должен знать слово `R2`.

Он должен знать:

```text
ObjectStore
```

---

# 11. Render cache — один из фундаментальных компонентов

Документ правильно указывает на напряжение между content-addressed cache и GlobalPass. 

Я бы уже сейчас ввёл:

```text
RenderKey =
    hash(
        node_type
        + implementation_version
        + parameters
        + input_asset_hashes
        + renderer_version
        + tier
        + color_context
    )
```

Например:

```text
Scene 17
   │
   ├── Background    → 71af...
   ├── VO            → e912...
   ├── CalloutText   → 62bc...
   ├── MotionCurve   → 12aa...
   └── Composite     → 98e1...
```

Поменялся текст callout:

```text
CalloutText ×
Composite   ×

VO         ✓ cached
Background ✓ cached
Motion     ✓ cached
```

Именно здесь появляется **экономика длинных видео**.

Не в скорости GPU.

---

# 12. Orchestration — Temporal

Вот где я бы сделал достаточно сильный выбор.

Не:

* Redis queues;
* cron;
* набор background jobs;
* самописный workflow engine.

А **Temporal**.

Произведение естественно превращается в durable workflow:

```text
ProjectWorkflow
│
├── BriefWorkflow
├── StoryWorkflow
│
├── SceneWorkflow[001]
│    ├── T0
│    ├── approval
│    ├── T1
│    ├── approval
│    ├── T2
│    └── T3
│
├── SceneWorkflow[002]
│
├── ...
│
└── GlobalMasterWorkflow
```

Temporal Workflow Execution рассчитан на durable, reliable, long-running execution и хранит event history, позволяющий восстановить состояние выполнения. ([Temporal Docs][14])

Это идеально ложится на:

```text
propose
→ render
→ wait(operator)
→ patch
→ rerender
→ approve
→ continue
```

и на процессы, которые могут идти **несколько дней**.

---

# 13. Агентная система тоже поверх Temporal

Очень важно не строить отдельный «agent framework universe».

Я бы определил агента примерно как:

```text
Agent
=
Temporal Workflow
+
LLM Activities
+
Domain Tools
```

Например:

```text
SceneDirectorAgent
    │
    ├── getScene()
    ├── getFacts()
    ├── proposeShotIntent()
    ├── compile()
    ├── validate()
    ├── requestPreview()
    └── proposePatch()
```

LLM-вызов — недетерминированная Activity.

Сам workflow — детерминированный orchestration.

Temporal сейчас прямо развивает интеграции для durable AI-agent workflows в TypeScript. ([Temporal Docs][15])

---

# 14. Python — только на ML-границе

Python будет необходим, но я **не позволял бы Python проникнуть в ядро системы**.

Python workers:

```text
models/
  text/
  tts/
  stt/
  image/
  video/
  tracking/
  segmentation/
  embeddings/
  identity/
```

Они получают:

```text
ModelJob
```

и возвращают:

```text
ArtifactManifest
```

Например:

```text
generate_video(
    prompt,
    references,
    duration,
    seed,
    model_profile
)

→

asset://sha256/...
```

Production Graph при этом не знает:

```text
Runway
Kling
Veo
Sora
ComfyUI
Diffusers
...
```

Он знает:

```text
VideoGenerationNode
```

А registry выбирает implementation.

Это защитит архитектуру от неизбежной смены моделей.

---

# 15. GPU-инфраструктура

Поначалу:

```text
Docker Compose
       │
       ├── postgres
       ├── temporal
       ├── api
       ├── browser-renderer
       ├── rust-renderer
       └── python-model-worker
```

Один GPU worker.

**Без Kubernetes.**

Когда появится:

* несколько GPU-машин;
* разные классы GPU;
* autoscaling;
* десятки параллельных render jobs;

тогда:

```text
Kubernetes
+
NVIDIA Container Toolkit
+
Temporal task queues
```

Kubernetes имеет штатное GPU scheduling через device plugins, в том числе для NVIDIA и AMD. ([Kubernetes][16])

Но это второй/третий этап, не фундамент продукта.

---

# 16. Observability

С первого дня:

**OpenTelemetry.**

Каждый render/agent/compile должен нести:

```text
project.id
scene.id
node.id
revision
tier
workflow.id
agent.id
model
model.version
render.key
cache.hit
gpu
duration
cost
input.tokens
output.tokens
```

OpenTelemetry сейчас предоставляет vendor-neutral модель для traces, metrics и logs. ([OpenTelemetry][17])

В результате можно будет увидеть:

```text
Project
  └─ Scene 12
      └─ T2 render
          ├─ compile       18 ms
          ├─ cache lookup   3 ms
          ├─ video model   91 s
          ├─ composite      4 s
          └─ validation   650 ms
```

Для агентной системы такая наблюдаемость практически обязательна.

---

# 17. Что я бы сознательно НЕ использовал

Это не менее важно.

| Не брать в ядро                         | Почему                                                             |
| --------------------------------------- | ------------------------------------------------------------------ |
| **HTML/CSS как canonical video format** | снова получим потолок EditFrame                                    |
| **React как video IR**                  | UI abstraction ≠ production semantics                              |
| **Python как основной backend**         | слишком большая часть платформы завяжется на ML-экосистему         |
| **Neo4j как source of truth**           | Story Graph не требует graph DB                                    |
| **JSON как единственный IR**            | слабая schema evolution и typing                                   |
| **OpenTimelineIO как весь IR**          | OTIO решает editorial interchange, а не compositing/audio/analysis |
| **FFmpeg filter graph как IR**          | это renderer implementation                                        |
| **ComfyUI graph как IR**                | это implementation конкретной ML-экосистемы                        |
| **Kubernetes с первого дня**            | инфраструктурный налог без пользы                                  |
| **Redis/BullMQ как workflow engine**    | слишком слабая модель для многодневного agent/render workflow      |
| **C++ как основной язык**               | понадобится через FFI, но не стоит делать им новую кодовую базу    |

Особенно важен последний принцип:

> **никакая внешняя технология не должна становиться семантикой произведения.**

FFmpeg, Chromium, Three.js, AI model, Blender, OpenFX — это **исполнители Production Graph**, а не Production Graph.

---

# 18. Как выглядел бы репозиторий

Я бы начал примерно так:

```text
video-platform/
│
├── apps/
│   └── studio/
│       └── React + TypeScript
│
├── services/
│   ├── api/
│   │   └── TypeScript
│   │
│   ├── orchestrator/
│   │   └── Temporal + TypeScript
│   │
│   ├── browser-renderer/
│   │   └── TypeScript + Chromium
│   │
│   └── model-worker/
│       └── Python
│
├── crates/
│   ├── story/
│   ├── production-ir/
│   ├── compiler/
│   ├── validator/
│   ├── continuity/
│   ├── patch/
│   ├── cache/
│   ├── render-plan/
│   └── renderer-wgpu/
│
├── schemas/
│   └── proto/
│
├── dsl/
│   ├── timeline/
│   ├── node/
│   ├── motion/
│   ├── audio/
│   └── color/
│
├── renderers/
│   ├── browser/
│   ├── native/
│   └── ffmpeg/
│
├── adapters/
│   ├── opentimelineio/
│   ├── models/
│   └── storage/
│
├── infra/
│   ├── docker/
│   └── kubernetes/
│
└── tests/
    ├── compiler/
    ├── golden-ir/
    ├── golden-render/
    └── continuity/
```

---

# 19. Но на **первом этапе** я бы реализовывал лишь эту вертикаль

Документ сам рекомендует начинать с минимальной Story Graph, fidelity как свойства узла и отдельного continuity checker, а T0 строить дешёво поверх browser rendering. 

Поэтому реально первая система:

```text
                    React / TypeScript
                           │
                           ▼
                     TypeScript API
                           │
                           ▼
                       Temporal
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        Rust compiler               PostgreSQL
              │
              ▼
      Production Graph IR
              │
              ▼
      Browser renderer
       Chromium + SVG
              │
              ▼
           FFmpeg
              │
              ▼
            MP4
```

и:

```text
Object storage → R2/S3
AI → provider adapters
```

**Без wgpu compositor.
Без Kubernetes.
Без OpenFX host.
Без полноценного ACES pipeline.
Без собственного audio engine.**

Но необходимые **абстракции под них уже существуют в IR**.

---

# 20. Итого: стек, который я бы зафиксировал сегодня

### Основной

```text
Frontend
    React + TypeScript

Control plane
    TypeScript + Node

Durable orchestration
    Temporal

Core / compiler / IR / validation
    Rust

DSL parsing
    Tree-sitter + Rust

Canonical schema
    Protocol Buffers

Database
    PostgreSQL

Asset storage
    S3-compatible object storage / R2

T0/T1 renderer
    Chromium + SVG/Canvas + Three.js + FFmpeg

T2/T3 renderer
    Rust + wgpu + FFmpeg + OpenColorIO/ACES

AI/model execution
    Python workers

Timeline interchange
    OpenTimelineIO

Observability
    OpenTelemetry

Local infrastructure
    Docker Compose

Later render farm
    Kubernetes + GPU workers
```

## Самое важное архитектурное решение

Я бы даже сформулировал его жёстче:

> **Мы строим не video editor и не AI-video wrapper. Мы строим компилятор аудиовизуального произведения.**

Тогда:

**Story Graph — semantic source.
DSL — authoring language.
Production Graph IR — executable representation.
Renderers — backends.
AI-модели — generators/plugins.
Temporal — execution fabric.
Rust — compiler/runtime.**

Именно такая граница даёт шанс прожить смену Chromium, FFmpeg, AI-моделей, GPU API и даже большей части UI, **не переписывая само понятие произведения**. Это, на мой взгляд, наиболее сильный технологический фундамент под заявленную в документе траекторию от минутного explainer до полнометражного фильма. 

Следующим логичным шагом я бы уже не обсуждал технологии вообще, а **спроектировал конкретный v0.1 monorepo: сервисы, Rust crates, схемы БД, `.proto`-контракты и границы процессов**. Именно там станет видно, не осталось ли в предлагаемом стеке скрытых архитектурных противоречий.

[1]: https://github.com/gfx-rs/wgpu?utm_source=chatgpt.com "gfx-rs/wgpu: A cross-platform, safe, pure-Rust graphics API."
[2]: https://react.dev/?utm_source=chatgpt.com "React"
[3]: https://www.w3.org/TR/webcodecs/?utm_source=chatgpt.com "WebCodecs"
[4]: https://www.w3.org/TR/webgpu/?utm_source=chatgpt.com "WebGPU"
[5]: https://playwright.dev/docs/screenshots?utm_source=chatgpt.com "Screenshots"
[6]: https://threejs.org/docs/?utm_source=chatgpt.com "three.js docs"
[7]: https://ffmpeg.org/ffmpeg.html?utm_source=chatgpt.com "ffmpeg Documentation"
[8]: https://opencolorio.readthedocs.io/en/latest/releases/ocio_2_5.html?utm_source=chatgpt.com "OCIO 2.5 Release - OpenColorIO - Read the Docs"
[9]: https://opentimelineio.readthedocs.io/en/latest/?utm_source=chatgpt.com "Welcome to OpenTimelineIO's documentation! - Read the Docs"
[10]: https://protobuf.dev/overview/?utm_source=chatgpt.com "Overview | Protocol Buffers Documentation"
[11]: https://tree-sitter.github.io/?utm_source=chatgpt.com "Tree-sitter: Introduction"
[12]: https://www.postgresql.org/docs/current/functions-json.html?utm_source=chatgpt.com "Documentation: 18: 9.16. JSON Functions and Operators"
[13]: https://developers.cloudflare.com/r2/api/s3/api/?utm_source=chatgpt.com "S3 API compatibility · Cloudflare R2 docs"
[14]: https://docs.temporal.io/encyclopedia/event-history/event-history-typescript?utm_source=chatgpt.com "Event History walkthrough with the TypeScript SDK"
[15]: https://docs.temporal.io/develop/typescript/integrations/ai-sdk?utm_source=chatgpt.com "AI SDK by Vercel integration"
[16]: https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/?utm_source=chatgpt.com "Schedule GPUs"
[17]: https://opentelemetry.io/docs/concepts/signals/?utm_source=chatgpt.com "Signals"
