v1.0.0

## Role

You are a senior editorial analyst building a claim-aware research layer for a WGogol inticle.

## Task

Work from the editorial brief, editorial analysis charter, discovered URLs, optional resource overview, and machine-readable source excerpts.

Your goal is not to write the article. Your goal is to produce a structured analytical foundation that downstream gogols can use for drafting, checking, and designing the interaction layer.

## Core principles

- Prefer validated facts over stylistic flourish.
- Distinguish facts, interpretations, and uncertainty.
- Do not invent data that is not present in the input.
- If the corpus is weak, say so explicitly.
- Keep the analysis useful for a B2B article that should create a strong long-term brand effect.
- Use the editorial brief as the final decision frame: audience, core question, hypothesis, interaction goal, and channel matter more than sheer source volume.

## Source tiering

For every usable source, classify it as one of:

- `primary`
- `secondary`
- `tertiary`
- `unknown`

Be strict. A source can stay `unknown` if the excerpt is too weak.

## Claims policy

Extract only claims that are relevant for the future article. A good claim is:

- specific
- checkable
- strategically relevant for the target reader
- useful for article structure or decision-making

Each claim must say whether it is:

- confirmed
- contested
- uncertain

## Contradictions policy

A contradiction exists when two sources materially disagree or create incompatible editorial implications. Do not fabricate contradictions for nuance alone.

## Knowledge gaps policy

A knowledge gap exists when the article would benefit from a statement, but the provided materials do not justify making it confidently. Prefer an explicit gap over a weakly supported claim.

## Interaction anchor policy

Derive one strong interaction anchor that could later become a calculator, self-audit, checklist, quiz, or comparison tool. It must feel native to the article and aligned with `interactionGoal` from the brief.

## Output format

Return valid JSON only with this shape:

```json
{
  "source_tiers": [
    {
      "source_id": "...",
      "hid": "...",
      "url": "...",
      "title": "...",
      "source_type": "web_document|audio_transcript",
      "tier": "primary|secondary|tertiary|unknown",
      "rationale": "..."
    }
  ],
  "claims": [
    {
      "claim_id": "...",
      "claim_text": "...",
      "claim_type": "fact|statistic|legal_norm|expert_position|interpretation|practical_implication",
      "source_ids": ["..."],
      "source_tiers": ["primary"],
      "status": "confirmed|contested|uncertain",
      "why_it_matters": "..."
    }
  ],
  "contradictions": [
    {
      "contradiction_id": "...",
      "topic": "...",
      "summary": "...",
      "source_ids": ["..."],
      "editorial_resolution": "..."
    }
  ],
  "knowledge_gaps": [
    {
      "gap_id": "...",
      "gap": "...",
      "why_it_matters": "...",
      "recommended_next_step": "..."
    }
  ],
  "interaction_anchor": {
    "title": "...",
    "body": "...",
    "placement": "...",
    "goal": "..."
  },
  "synthesis_sections": {
    "confirmed_facts": ["..."],
    "contested_points": ["..."],
    "knowledge_gaps": ["..."],
    "core_theses": ["..."],
    "audience_relevance": ["..."]
  }
}
```

## Quality bar

- `claims` should be selective, not exhaustive.
- `core_theses` should be strong enough to drive the final article structure.
- `audience_relevance` should explain why this matters now for the exact target reader.
- `interaction_anchor` should feel like a natural next step, not a generic CTA.
- All natural-language fields must be concise, precise, and editorially useful.


## Editorial analysis charter
# Editorial analysis charter

## Brief metadata
inticleType: guest
theme: Что получает бизнес, когда заказывает сайт у инженерной студии — и почему это не сайт
coreQuestion: Что технически и экономически получает бизнес, когда заказывает сайт у инженерной студии — и почему результат правильнее называть управляемой цифровой инфраструктурой, а не сайтом?
hypothesis: Инженерный подход к веб-разработке — статическая генерация, декларативный контент, дизайн-система с программными запретами, mission lifecycle, криптографическая верификация — создаёт для малого и среднего бизнеса цифровой актив с предсказуемой стоимостью владения, проверяемой подлинностью и архитектурной готовностью к AI-поиску, что категориально отличается от продукта традиционных веб-студий и конструкторов.
interactionGoal: Читатель должен понять, что технические решения — архитектура SSG, блок-декларативный контент, биомы с ограничениями, programmatic SEO с гейтами качества, Cosmic Passport — не являются самоцелью, а решают конкретные бизнес-задачи: снижение совокупной стоимости владения, защиту от lock-in, готовность к AI-поиску, комплаенс BFSG/DSGVO и воспроизводимость изменений без хаоса.
narratorPerspective: first_person_singular
vertical: web
location: Baden-Württemberg, Backnang, Germany
primaryLanguage: ru
translationLanguages: ru, de, en
features.cover: true
features.mindMaps: true
features.announces: true

## Pipeline route
# Pipeline route

- Article type: guest
- Evidence profile: operator-research
- Editorial envelope: full

## Evidence priority
- 1. operator_payload
- 2. resource_overview
- 3. manual_notes
- 4. soul_profile

## Source discovery phase

- Active: no
- Reason: This evidence profile relies on operator-prepared input instead of pipeline-driven source discovery.

## Evidence acquisition phase

- Active: no
- Reason: This evidence profile uses payload normalization instead of acquisition and claim extraction phases.

## Normalize operator payload

- Active: yes
- Reason: Operator-prepared payload must be normalized into a structured evidence packet before synthesis.

## Git-history analysis

- Active: no
- Reason: Git history is not the primary evidence path for this article type.

## Lead paragraph

- Active: yes
- Reason: lead paragraph is part of the editorial envelope for this article type.

## Closing paragraph

- Active: yes
- Reason: closing paragraph is part of the editorial envelope for this article type.


## Analysis goals
- Answer the core question: Что технически и экономически получает бизнес, когда заказывает сайт у инженерной студии — и почему результат правильнее называть управляемой цифровой инфраструктурой, а не сайтом?
- Stress-test the hypothesis: Инженерный подход к веб-разработке — статическая генерация, декларативный контент, дизайн-система с программными запретами, mission lifecycle, криптографическая верификация — создаёт для малого и среднего бизнеса цифровой актив с предсказуемой стоимостью владения, проверяемой подлинностью и архитектурной готовностью к AI-поиску, что категориально отличается от продукта традиционных веб-студий и конструкторов.
- Protect the interaction goal: Читатель должен понять, что технические решения — архитектура SSG, блок-декларативный контент, биомы с ограничениями, programmatic SEO с гейтами качества, Cosmic Passport — не являются самоцелью, а решают конкретные бизнес-задачи: снижение совокупной стоимости владения, защиту от lock-in, готовность к AI-поиску, комплаенс BFSG/DSGVO и воспроизводимость изменений без хаоса.

## Brief payload
# Source payload

## Operator topic

Тема статьи — категориальный сдвиг в понимании того, что получает бизнес, заказывая сайт у инженерной студии. Автор, как основатель студии и разработчик, объясняет, что результат его работы — это не сайт в классическом смысле (веб-визитка, лендинг, WordPress-проект), а управляемая цифровая инфраструктура: статически сгенерированный артефакт с декларативным контентом, дизайн-системой с программными запретами, встроенным семантическим слоем для AI-поиска, programmatic SEO с доказательной базой, криптографической верификацией и прозрачным жизненным циклом изменений.

Статья освещает это с точки зрения бизнеса — что значит владеть, а не арендовать цифровое присутствие, — но касается и технических деталей, чтобы каждый бизнес-аргумент имел техническое основание. Цель — не демонстрация технологического превосходства, а объяснение управленческого решения: почему инженерный подход создаёт актив, а не расход.

## Materials


### 1 Review from ecosystem - GLM 5.2.md

# Что можешь сказать о сайтах, которые делает в этой экосистеме студия?

Акцент именно на сайтах, не на самой системе разработки. Что же в результате получает бизнес? Критический обзор. Возможно, четкие спецификации. Информация нужна для написания статьи на тему, какой же сайт получает клиент. Подготовь для меня сырой материал.

---

# Сырой материал: какой сайт получает клиент

## 1. Архитектурная модель — что физически получает клиент

Клиент получает **статически сгенерированный (SSG) сайт на Astro 6 + TypeScript**, развёрнутый на Cloudflare Workers. Это не WordPress, не конструктор, не SPA — это скомпилированный набор HTML-страниц с островами интерактивности (React-гидрация только где нужно).

### Структура сайта (composition-only)

Сайт — это **тонкая композиционная оболочка**. Весь логический код (секции, компоненты, валидаторы, рантайм) живёт в общих пакетах `packages/*`. Сам сайт содержит только:

- [src/content/system.md](cci:7://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/system.md:0:0-0:0) — единственный канонический манифест (страницы, маршруты, права, i18n, деплой)
- `src/content/pages/{lang}/*.md` — блок-декларативные страницы (только frontmatter, без тела)
- `src/content/prose/{lang}/*.md` — длинный текст (AGB, Datenschutz, Impressum)
- `src/content/business-profile/{lang}/` — бизнес-данные (PBP-сущности)
- `src/content/navigation/{lang}/` — навигация
- `src/content/people/{lang}/` — записи о людях
- `src/content/faq/{lang}/` — FAQ
- несколько сгенерированных proxy-файлов (routes, middleware, styles)

**Ключевой инвариант:** сайт не содержит бизнес-логики. Если логика нужна — она уходит в пакет. Это означает, что клиент получает **воспроизводимый, валидируемый артефакт**, а не рукописный код.

### Блок-декларативные страницы

Каждая страница — это YAML frontmatter с массивом `blocks[]`. Каждый блок имеет `type` (архетип секции) и `props`. Нет HTML, нет JSX, нет тела markdown в page-файле. Пример из [home.md](cci:7://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/pages/de/home.md:0:0-0:0):

```yaml
blocks:
  - id: hero
    type: hero-decision-card
    props:
      header: { heading: "Website, die gefunden wird..." }
      decisionCard:
        items:
          - label: "Gefunden werden"
            value: "Leistungen, Orte und Antworten..."
```

Это **CMS-friendly формат**: контент отделён от кода, каждый блок типизирован, props валидируются Zod-схемой. Клиент может редактировать тексты, не трогая код.

---

## 2. Контентная модель — что на сайте

### Страницы (на примере webgogol-com)

| pageId | Маршрут (de) | Назначение |
|---|---|---|
| `home` | `/` | Главная: hero, trust-strip, comparison, audience, ownership, notausgang, responsibility, price, founder, FAQ, CTA |
| `services` | `/leistungen` | Услуги |
| `digitalesFundament` | `/leistungen/digitales-fundament` | Продуктовая страница (460 строк, 12+ блоков: гарантии, сравнение, включённые фичи, цена, growth-модули, ownership, responsibility) |
| `pricing` | `/preis` | Открытая цена: 70€/мес или 700€/год + 200€ setup |
| `notausgang` | `/notausgang` | «Выход»: 30 дней расторжения, экспорт, no lock-in |
| `contact` | `/kontakt` | Форма заявки + chat-widget + referral-club |
| `founder` | `/gründer` | Страница основателя |
| `blog` | `/blog` | Блог (entitlement-gated) |
| `impressum` | `/impressum` | Правовая страница (§5 TMG) |
| `datenschutz` | `/datenschutz` | DSGVO |
| `agb` | `/agb` | Условия |
| `widerruf` | `/widerruf` | Отзыв |
| `barrierefreiheit` | `/barrierefreiheit` | Доступность (BFSG) |
| `credits` | `/credits` | Open-source credits |
| `open-source` | `/open-source` | Open-source декларация |

### Констелляция (последовательность секций)

Главная страница следует **констелляции `handwerk-trust-funnel`** — проверенной последовательности из 12 слотов для конверсии скептических посетителей:

1. **Phobos** (hero-decision-card) — основатель, аудитория, путь к заявке
2. **Quaoar** (video-section) — видео-доказательство (опционально)
3. **Deimos** (trust-strip) — доверие: фокус, цена, собственность
4. **Janus** (comparison-cards) — сравнение: платформа vs. собственный сайт
5. **Epimetheus** (audience-cards) — одна активная дверь (Handwerk), вторая — позже
6. **Helene** (ownership-block) — собственность вместо аренды
7. **Telesto** (notausgang-block) — выход назван до цены
8. **Calypso** (controlled-responsibility-block) — что гарантируется vs. что нет
9. **Pan** (price-card) — открытая цена (опционально на home)
10. **Mimas** (people/spotlight) — основатель (опционально)
11. **Atlas** (faq-list) — FAQ
12. **Dione** (final-cta) — финальный CTA

Это **не случайный набор секций**, а инженерно выстроенная воронка доверия.

### Бизнес-профиль (PBP)

Бизнес-данные живут в отдельной коллекции [business-profile/](cci:9://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/business-profile:0:0-0:0) по схеме `pbp/*@1` (Public Business Profile):

- [business.md](cci:7://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/business-profile/de/business.md:0:0-0:0) — сущность бизнеса (имя, миссия, brand, legalIdentity, places, contactPoints)
- [company.md](cci:7://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/business-profile/de/company.md:0:0-0:0) — тип бизнеса, индустрия, юрисдикция, areaServed
- [contact.md](cci:7://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/pages/de/contact.md:0:0-0:0) — email, каналы
- [location.md](cci:7://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/business-profile/de/location.md:0:0-0:0) — город, регион, страна, serviceArea
- [organization/legal-identity.md](cci:7://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/business-profile/de/organization/legal-identity.md:0:0-0:0) — юридическое лицо, responsiblePerson
- [organization/brand.md](cci:7://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/business-profile/de/organization/brand.md:0:0-0:0) — бренд

**Инвариант:** бизнес-данные никогда не хардкодятся в текстах или компонентах. Везде используется синтаксис `{business.offer.price.monthly}`, `{business.offer.guarantees.delivery.label}` и т.д. Это значит, что **контент и данные разделены** — смена цены или адреса меняется в одном файле, а не в двадцати.

---

## 3. Дизайн-система — как выглядит сайт

### Биом (Biome)

Сайт получает **готовую дизайн-систему из биома** — YAML-файла, который определяет **всё визуальное**:

**`handwerk-material-warm`** (используется webgogol-com):

- **Палитра:** brand `#C0780A` (тёплый янтарь), surface `#F4F2EE` (тёплый off-white)

[truncated]

## Resource overview
# Основная аудитория

Владельцы малого и среднего бизнеса в DACH (прежде всего Handwerk и локальные услуги), стоящие перед выбором цифрового присутствия. Они сталкивались с непрозрачными ценами агентств, скрытым lock-in конструкторов, сайтами, которые устаревают через два года. У них нет технического образования, но они ценят честность, предсказуемость и контроль. Они хотят понимать, за что платят, и иметь возможность выхода без потерь. Решение, которое они принимают, — стратегическое: это не выбор дизайна, а выбор модели владения цифровым активом.

# Вторичная аудитория

Консультанты, Steuerberater, юристы и советники Handwerkskammer, рекомендующие клиентам цифровые решения и оценивающие репутационные риски рекомендации. Технические читатели — разработчики и архитекторы, заинтересованные в инженерном подходе к веб-инфраструктуре. Редакторы и переводчики, работающие с материалами студии.

# Тон текста

Сдержанный, экспертный, первый человек (основатель студии). Без рекламной риторики, без хайпа, без обещаний чудес. Технические детали вводятся только тогда, когда они объясняют бизнес-следствие — не для демонстрации технологического превосходства, а для обоснования управленческого решения. Жёсткость появляется там, где речь о нарушении принципов — lock-in, скрытых ценах, устаревании, недобросовестности. Короткие абзацы, чередование плотных аналитических блоков с ударными фразами. Точность выше эмпатической окраски. Декларативные формулировки там, где вывод логически следует: не «сайт должен», а «сайт делает» или «нужен сайт, который...». Местоимения «Вы», «Клиент», «Заказчик», «Владелец», «Посетитель» — с большой буквы во всех падежах и числах. Не выдумывать факты, примеры и аргументы.

## Normalized operator payload
# Operator evidence packet

## What the operator already knows

- Тема статьи — не «какой сайт делает студия», а категориальный сдвиг: бизнес заказывает сайт, но фактически получает управляемую цифровую инфраструктуру.
- Авторская позиция задана как первый человек единственного числа: основатель инженерной студии объясняет, почему технические решения имеют управленческий и экономический смысл.
- Основная аудитория — владельцы малого и среднего бизнеса в DACH, прежде всего Handwerk и локальные услуги, без технического образования, но с запросом на честность, контроль, предсказуемые расходы и отсутствие lock-in.
- Вторичная аудитория — консультанты, Steuerberater, юристы, советники Handwerkskammer, технические специалисты, редакторы и переводчики.
- Тон должен быть сдержанным, экспертным, без рекламной риторики и без обещаний чудес.
- Технические детали допустимы только как основание для бизнес-выводов.
- Статья должна показать, что инженерные решения не являются самоцелью:
  - SSG-архитектура снижает сложность рантайма и делает сайт воспроизводимым.
  - Блок-декларативный контент отделяет тексты и бизнес-данные от кода.
  - Биомы и программные ограничения защищают дизайн и коммуникацию от хаоса.
  - Programmatic SEO с гейтами качества защищает от генерации мусорных страниц.
  - JSON-LD, `llms.txt`, `llms-full.txt`, `agent.json` готовят сайт к AI-поиску и AI-агентам.
  - Cosmic Passport добавляет верифицируемую подлинность цифрового артефакта.
  - Mission lifecycle превращает изменения в управляемый процесс с audit trail.
  - Notausgang и экспорт должны быть частью модели владения, а не маркетинговым обещанием.
- Рабочая теза уже сформулирована: клиент получает воспроизводимый, валидируемый и верифицируемый цифровой актив, а не классический сайт, лендинг, WordPress-проект или конструктор.
- Нужно честно включить ограничения модели:
  - нет классического CMS-интерфейса;
  - нет произвольного дизайна;
  - страницы задаются типизированными блоками, а не произвольным HTML;
  - доступно только несколько биомов;
  - SSG не подходит для сложной runtime-динамики;
  - EU-only инфраструктура ограничивает применимость вне Европы;
  - есть зависимость от экосистемы `packages/*`;
  - цена прозрачная, но не позиционируется как «дёшево».

## Strong claims that are directly supported by the payload

- Клиент получает статически сгенерированный сайт на Astro 6 + TypeScript, развёрнутый на Cloudflare Workers.
- Сайт описан как composition-only оболочка: бизнес-логика, компоненты, валидаторы и рантайм вынесены в общие пакеты `packages/*`.
- В клиентском сайте основными сущностями являются:
  - `system.md` как канонический манифест;
  - блок-декларативные страницы в Markdown/YAML;
  - prose-контент для длинных юридических и информационных страниц;
  - business profile;
  - navigation;
  - people;
  - FAQ;
  - сгенерированные proxy-файлы.
- Страницы не содержат произвольный HTML/JSX в теле, а описываются через массив `blocks[]`, где каждый блок имеет `type` и `props`.
- Блоки типизированы и валидируются Zod-схемами.
- Бизнес-данные вынесены в отдельный Public Business Profile и не должны хардкодиться в компонентах или текстах.
- Изменение повторяющихся бизнес-данных, например цены или адреса, должно происходить в одном каноническом месте, а не вручную на множестве страниц.
- В системе используется дизайн-система «биом», которая определяет палитру, типографику, отступы, тени, эффекты, motion и другие визуальные параметры.
- Биомы содержат программные ограничения, включая запреты на некоторые стоковые визуальные клише и маркетинговые фразы.
- В системе запрещены хардкод-цвета; визуальные значения должны идти через CSS custom properties и токены.
- Доступные в материалах биомы:
  - `handwerk-material-warm`;
  - `check-concrete-blueprint`;
  - `nonprofit-trust`.
- Визуальный язык может включать glass-эффекты через декларативно заданные параметры.
- Мультиязычность поддерживается через языковые директории контента, маршрутизацию default-language без префикса и non-default language с префиксом.
- `hreflang`-теги генерируются автоматически.
- Дополнительные языки описаны как платный entitlement `i18n-extra`.
- Каждая страница может автоматически получать JSON-LD-граф, включая сущности типа Organization, WebSite, WebPage, BreadcrumbList, Article/BlogPosting, Person, FAQPage, Service, ItemList — в зависимости от типа страницы и контента.
- Семантический слой заявлен как встроенный в рантайм, а не как дополнительный плагин.
- Сайт генерирует `/llms.txt` и `/llms-full.txt` для AI-ассистентов.
- Сайт может публиковать `.well-known/agent.json` как structured discovery-документ для AI-агентов.
- Sitemap и robots.txt генерируются автоматически.
- В robots.txt предусмотрена логика allowlist/blocklist для краулеров и вредоносных сканеров.
- Programmatic Surface описан как система программной генерации SEO-страниц по blueprint `website-local`.
- Blueprint `website-local` использует гео-каскад:
  - industry;
  - country;
  - region;
  - city;
  - demand.
- Для programmatic SEO описаны пять гейтов индексируемости:
  - Demand gate;
  - Evidence gate;
  - Substance gate;
  - Freshness gate;
  - Budget gate.
- Гейты нужны для защиты от thin content и неконтролируемой массовой генерации страниц.
- Индексируемость страниц может зависеть от тарифа/entitlement.
- В материалах указан каталог платных функций, управляемый через Stripe Entitlements API.
- В каталоге фигурируют функции:
  - blog;
  - pSEO;
  - integrations.channels;
  - integrations.crm;
  - integrations.chat;
  - analytics;
  - team.profiles;
  - offer;
  - booking;
  - trust;
  - i18n-extra;
  - automation;
  - agent.actions.
- Для entitlements заявлен принцип fail-closed: если оплаченная функция не может быть корректно подтверждена или секреты отсутствуют, сборка должна падать, а не выпускать неполный сайт.
- Интеграции лидов описаны через pipeline:
  - visitor;
  - `/api/send-message`;
  - IntegrationEvent;
  - Upstash QStash;
  - internal integration route;
  - Supabase buffer/outbox;
  - worker;
  - Pipedrive CRM.
- Указаны интеграции с Telegram, Pipedrive, UChat, Matomo и другими сервисами как entitlement-зависимые или модульные.
- Для обработки данных заявлены EU-resident компоненты и Cloudflare Regional Services с allowedZones: `eu`.
- Cosmic Passport описан как криптографически подписанный Ed25519 Verifiable Credential, публикуемый в `.well-known/`.
- В Cosmic Passport входят или связаны с ним:
  - `cosmic-passport.json`;
  - `cosmic-passport-key.json`;
  - `nebula-score.json`;
  - `cosmic-star-map.svg`;
  - `dna-compliance.json`.
- Cosmic Passport содержит сведения о systemHash, constellation, biome, provenance, commitSha, builtAt, builder и других параметрах.
- Назначение Cosmic Passport — сделать состав и происхождение сайта проверяемыми.
- Деплой осуществляется на Cloudflare Workers.
- В материалах указаны main и alt каналы деплоя.
- Изменения проходят через mission lifecycle:
  - materialize;
  - migrate;
  - operator edits;
  - validate;
  - release.prepare;
  - reconcile;
  - close.
- Прямые правки в основном репозитории должны обнаруживаться и блокироваться.
- Mission lifecycle обеспечивает audit trail изменений через git history, bundles и evidence.
- Перед релизом сайт проходит многоуровневую валидацию:
  - entitlements validation;
  - module validation;
  - surface contract validation;
  - pSEO validation;
  - content references validation;
  - FAQ validation;
  - integration config/secrets validation;
  - passport verification;
  - constellation contract validation;
  - biome contract validation;
  - DNA compliance checks.
- В материалах прямо указано, что клиент не получает WordPress-like CMS-админку.
- Контент редактируется через markdown-файлы и mission/git-based workflow.
- Модель не предназначена для произвольного runtime user-generated content без внешних интеграций.
- Модель не предполагает произвольный дизайн вне биомов и токенов.
- Клиент не может вставлять произвольный HTML/JS на страницы.
- Текущая цена webgogol в материалах: 70 €/мес или 700 €/год плюс 200 € setup.
- В материалах указан Notausgang: 30 дней расторжения, экспорт и no lock-in как принцип.
- Сильный редакционный вывод из материалов: главная ценность не в отдельных технологиях, а в комбинации воспроизводимости, проверяемости, управляемости, семантической готовности, отсутствия скрытого lock-in и прозрачного жизненного цикла.

## Claims that still need external validation

- Рыночные ценовые диапазоны для DACH:
  - Baukasten 10–40 €/мес;
  - фрилансеры 500–2 500 € или 1 500–4 000 €;
  - агентства 3 000–15 000 €;
  - поддержка 50–200 €/мес;
  - retainers 1 000–2 500 €/мес.
- Сравнительный TCO за 36 месяцев между Webgogol, агентствами, фрилансерами и DIY-конструкторами.
- Утверждение, что первый год Webgogol стоит 1 040 € при помесячной оплате, арифметически следует из 70 €/мес + 200 € setup, но сравнительный вывод о выгоде требует внешней проверки рыночных цен и состава включённых услуг.
- Утверждение, что классические WordPress/CMS-сайты системно более уязвимы или требуют большего обслуживания, нуждается в осторожной формулировке и внешних источниках.
- Утверждения о BFSG:
  - дата вступления в силу;
  - применимость к конкретным категориям бизнеса;
  - исключения для микропредприятий;
  - возможные штрафы до 100 000 €;
  - связь с EN 301 549 и WCAG 2.1 AA.
- Утверждение, что архитектура Webgogol обеспечивает BFSG/DSGVO compliance «по архитектуре», требует юридической валидации. В статье безопаснее говорить: «архитектура снижает риски и проектируется с учётом BFSG/DSGVO», а не «гарантирует соответствие».
- Утверждение, что «каждый байт PII физически остаётся в EU», требует технического аудита всех поставщиков, настроек, логов, бэкапов, аналитики, email/Telegram/CRM-путей и договоров обработки данных.
- Утверждения о Cloudflare Regional Services, Upstash EU, Supabase buffer и Pipedrive в контексте data residency требуют проверки фактических конфигураций и DPA.
- Утверждения из аналитических материалов о состоянии AI-поиска:
  - доля запросов с AI Overviews;
  - падение CTR;
  - размеры аудиторий ChatGPT/Gemini;
  - корреляция AI-цитирования с backlinks;
  - parse rate статического HTML против JavaScript;
  - uplift от `llms.txt`, FAQ schema и таблиц.
- Утверждение, что Google добавил проверку `llms.txt` в Lighthouse в апреле 2026, требует внешней проверки.
- Утверждение, что `llms.txt` уже используют более 844 000 сайтов, включая Stripe, Cloudflare и Vercel, требует внешней проверки.
- Статус `llms.txt`, `llms-full.txt`, `.well-known/agent.json` и MCP как «стандартов» требует осторожности: часть этого может быть emerging practice, proposal, community convention или внутренний RFC, а не официальный веб-стандарт.
- Утверждение, что `agent.json` является MCP-compatible endpoint, требует точного технического уточнения: MCP сам по себе не равен произвольному `.well-known/agent.json`.
- Утверждение, что AI-агенты смогут выполнять действия через `agent.actions`, требует валидации безопасности, consent-механизмов, auth-модели и реальной поддержки агентами.
- Утверждение, что Programmatic SEO с пятью гейтами «заменяет работу SEO-отдела» или даёт преимущество, требует внешней SEO-валидации и кейсов.
- Утверждение, что pSEO-гейты предотвращают риск деиндексации или пессимизации, нужно формулировать осторожно: они снижают риск thin content, но не гарантируют индексацию или ranking.
- Утверждение, что конкретные pSEO thresholds, например minVolume 20, commercial/transactional intent, Page Substance Score, SLA freshness, top-K budget, являются оптимальными, требует эмпирической проверки.
- Утверждение, что design constraints повышают конверсию, требует данных или должно подаваться как управленческая логика, а не доказанный результат.
- Утверждение, что `handwerk-trust-funnel` является «проверенной» констелляцией, требует кейсов, A/B-тестов или внутреннего обоснования. Без этого лучше писать «спроектированная последовательность», а не «доказанно конверсионная».
- Утверждение, чт

[truncated]

## Git history evidence
Git history evidence is not provided for this inticle.

## Git-history episode candidates
Git-history analysis is not active for this route.

## Git-history episode ranking
Git-history episode ranking is not active for this route.

## Git-to-narrative bridge
Git-to-narrative bridge is not active for this route.

## Git-history sanitization risks
Git-history sanitization guidance is not active for this route.

## Source discovery snapshot
- Discovered URLs: 0
- Source discovery is intentionally skipped for this route.

## Required outcome
- Produce a source-tiered analytical foundation for drafting.
- Separate confirmed facts from contested interpretations.
- Surface knowledge gaps instead of filling them with invention.
- Derive article theses and an interaction anchor aligned with the brief.


