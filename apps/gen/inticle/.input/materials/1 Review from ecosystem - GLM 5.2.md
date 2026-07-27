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

- **Палитра:** brand `#C0780A` (тёплый янтарь), surface `#F4F2EE` (тёплый off-white), ink `#1B1D22`
- **Типографика:** Playfair Display (заголовки, serif), Inter (body, sans), DM Mono (mono)
- **Scale ratio:** 1.22, base 17px, lineHeight body 1.55, heading 1.08
- **Spacing:** 8px base, container max 960px, section padding clamp(56px, 7vw, 104px)
- **Motion:** 120ms/200ms/360ms, cubic-bezier(0.2, 0, 0, 1), reduce-motion respect
- **Shadows:** 7 уровней (sm, md, lg, xl, glass, glow, header, appeal)
- **Gradients:** accent, primary, vignetteDark
- **Site background:** color + radial gradient layers
- **Fonts:** Inter (400/500/600), Playfair Display (400/700 + italic), DM Mono (300/400/500) — через `@fontsource`

**Критично: биом содержит constraints (запреты):**

```yaml
constraints:
  forbidStockPhotoTags: [hard-hats, generic-handshake, high-five]
  forbidPhrases: [günstig, "von 1 €/Tag", "Ergebnis garantiert"]
  enforceTabularNumeralsIn: [price, stats]
```

Это значит, что **дизайн-система программно запрещает определённый язык и визуал**. Нельзя вставить стоковое фото с касками, нельзя написать «дёшево» или «результат гарантирован».

### Доступные биомы (на данный момент 3)

| Биом | Семейство | Палитра | Шрифты | Семантика |
|---|---|---|---|---|
| `handwerk-material-warm` | handwerk-trust-engineering | Янтарь/тёплый off-white | Playfair Display + Inter + DM Mono | Ремесло, инженерия, доверие |
| `check-concrete-blueprint` | check-quality-operator | Янтарь/тёплый off-white | Inter + Inter + JetBrains Mono | Quality operator, технический |
| `nonprofit-trust` | charity-donation-trust | Зелёный `#2D5016`/кремовый | Lora + Inter + JetBrains Mono | Некоммерческая организация, доверие |

### CSS-токены (DNA-инвариант)

**Запрещены хардкод-цвета.** Все цвета, отступы, тени, шрифты идут через `--ds-*` CSS custom properties из `packages/tokens`. Биом проецируется в токены через `projectBiomeToTokens()`. Каскадные слои CSS: `@layer reset, tokens, base, components, utilities, overrides`.

### Эффекты (glass-morphism)

На сайте широко используется **glass-эффект** на карточках, панелях, элементах списков:

```yaml
effects:
  - target: card
    stack:
      - kind: glass
        enabled: true
        blur: 14
        saturate: 140
        tint: surface
        tintOpacity: 0.78
        border: hairline
```

Это даёт **полупрозрачные матовые поверхности** с тонкой границей — визуальный язык, единый для всего сайта.

---

## 4. Локализация (i18n)

Сайт получает **полноценную мультиязычность**:

- Языки по умолчанию: [de](cci:9://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/pages/de:0:0-0:0) (немецкий) + [uk](cci:9://file:///home/syrokomskyi/projects/webgogol/webgogol-4/missions/webgogol-com-m000009/workpiece/src/content/pages/uk:0:0-0:0) (украинский)
- Маршрутизация: default-language без префикса (`/leistungen`), non-default с префиксом (`/uk/posluhy`)
- hreflang-теги генерируются автоматически
- Переводы навигации, метаданных, UI-лейблов
- Контент-файлы дублируются по языкам: `pages/de/*.md` + `pages/uk/*.md`
- Бизнес-профиль тоже по языкам
- **Fallback:** если перевода нет — используется default-language (RFC-0008)

Дополнительные языки — **платный entitlement** (`i18n-extra`).

---

## 5. Семантический слой (SEO + AI)

### JSON-LD (schema.org)

Каждая страница генерирует **полный JSON-LD граф** автоматически:

- `Organization` (или `NGO` / `ProfessionalService`) — с legalName, foundingDate, address, contactPoints, areaServed, makesOffer (Offer + PriceSpecification), sameAs, logo
- `WebSite` — с publisher
- `WebPage` — с breadcrumb, inLanguage
- `BreadcrumbList` — автоматические хлебные крошки на каждой не-home странице (RFC-0229)
- `Article` / `BlogPosting` — для блог-постов (datePublished, author, keywords)
- `Person` — для team/founder страниц
- `FAQPage` / `Question` / `Answer` — для FAQ-блоков
- `Service` — для услуг
- `ItemList` — для списков инициатив/услуг

**Это не плагин, не опция — это встроено в рантайм.** Контент → JSON-LD генерируется детерминированно из канонических данных.

### llms.txt + llms-full.txt

Сайт генерирует **два файла для AI-ассистентов**:

- `/llms.txt` — краткий индекс: название организации, описание, ссылки на primary sources (Markdown link rows с absolute URLs), organization facts
- `/llms-full.txt` — полный текстовый дамп: все страницы с заголовками, URL, описаниями, телами блоков, people, services, location, offer

### Agent Surface (`.well-known/agent.json`)

Для tool-using AI-агентов генерируется **структурированный discovery-документ** с knowledge + capabilities. Это MCP-совместимый endpoint (RFC-0290), который позволяет AI-агентам не просто читать текст, а **выполнять действия** (agent.actions entitlement).

### Sitemap + robots.txt

- Sitemap генерируется автоматически из system.md pages + programmatic surface entries
- robots.txt с **crawler allowlist/blocklist** — разрешены GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Grok, Applebot-Extended, Amazonbot, Meta-ExternalAgent; заблокированы nikto, nmap, sqlmap

---

## 6. Programmatic Surface (pSEO) — автоматическая генерация страниц

Это **самая мощная часть**, которую получает клиент — **программная генерация сотен/тысяч SEO-страниц** по blueprints.

### Blueprint `website-local` (5-уровневая гео-каскад)

```
industry × country × region × city × demand
```

| Depth | URL-паттерн (de) | Пример | Indexability |
|---|---|---|---|
| 0 | `/website` | Pillar-хаб | index |
| 1 | `/website/{industry}` | `/website/maler` | index |
| 2 | `/website/{industry}/{country}` | `/website/maler/deutschland` | navigation-noindex (canonical → tradeHub) |
| 3 | `/website/{industry}/{country}/{region}` | `/website/maler/deutschland/baden-wuerttemberg` | navigation-noindex (regional-gated) |
| 4 | `/website/{industry}/{country}/{region}/{city}` | `/website/maler/deutschland/baden-wuerttemberg/backnang` | evidence-gated |
| 5 | `/website/{industry}/{country}/{region}/{city}/{demand}` | `/website/maler/.../backnang/fassadenstreichen` | demand-gated, evidence-gated |

### Indexability gates (5 уровней защиты от мусорных страниц)

Каждая сгенерированная страница проходит **пять детерминированных гейтов** перед тем, как попасть в индекс:

Continuing — concise version:

1. **Demand gate** — есть ли поисковый спрос (minVolume: 20, commercial/transactional intent)
2. **Evidence gate** — есть ли Werk-доказательства (minWerkEvidence, requiredRecordFields, minTupleSpecificFacts)
3. **Substance gate** — Page Substance Score (0-100): independent blocks, unique token ratio, signal blocks, link diversity. Ниже substanceMin → noindex
4. **Freshness gate** — SLA per depth (270-3650 дней), stale → noindex
5. **Budget gate** — top-K indexable by substance score, tied to Stripe tier

**Тарифы pSEO (Stripe):**

| Lookup key | Budget | Уровень |
|---|---|---|
| `feature_pseo` | 12 страниц | Base «Быть найденным» |
| `feature_pseo_regional` | 500 | Regional-hub (unlocks d3-d4) |
| `feature_pseo_pro` | 5,000 | Pro |
| `feature_pseo_scale` | 50,000 | Scale |

### LLM-enrichment (замороженный, provenanced)

Для depth-5 страниц генерируются **утверждённые нарративы** (narrative) и local-market сигналы через LLM — один раз, frozen, с provenance. Это не runtime-генерация, а build-time enrichment, который валидируется и замораживается.

---

## 7. Entitlements — платная функциональность

Закрытый каталог из 13 платных фич (RFC-0169), управляемый через **Stripe Entitlements API**:

| Feature | Что разблокирует |
|---|---|
| `blog` | Блог с Article/BlogPosting JSON-LD |
| `pseo` | Programmatic Surface (до 12 страниц base) |
| `integrations.channels` | Telegram/Email уведомления о заявках |
| `integrations.crm` | Pipedrive CRM (через Supabase-buffer) |
| `integrations.chat` | UChat виджет (consent-gated, click-to-load) |
| `analytics` | Matomo analytics (first-party proxy) |
| `team.profiles` | Профили команды (Person JSON-LD) |
| `offer` | Модульное предложение (Angebot) |
| `booking` | Онлайн-бронирование + WhatsApp уведомления |
| `trust` | Блок отзывов с модерацией |
| `i18n-extra` | Дополнительные языки |
| `automation` | Интеграция с календарём/CRM/Email |
| `agent.actions` | AI-agent-invocable capabilities (MCP endpoint) |

**Fail-closed:** если клиент платит, но STRIPE_SECRET_KEY отсутствует — билд падает. Платящий клиент никогда не получит сайт без разблокированных фич.

---

## 8. Интеграции и доставка лидов

### Funnel architecture

```
Visitor → /api/send-message → IntegrationEvent → Upstash QStash (EU) → /internal/integration-route
                                    ↓
                            Supabase buffer + outbox
                                    ↓
                        lagebild-sync-worker → Pipedrive CRM
```

- **Telegram** — канал уведомлений
- **Pipedrive** — CRM (через Supabase-buffer, не напрямую)
- **UChat** — chat-widget (consent-gated, click-to-load, DSGVO-compliant)
- **Upstash QStash + Redis** — EU-resident delivery backbone (eu-central-1)
- **Cloudflare Regional Services** — EU-only execution, allowedZones: [eu]

**Data residency:** каждый байт PII физически остаётся в EU.

---

## 9. Cosmic Passport — верифицируемая идентичность сайта

Сайт публикует **подписанный Ed25519 Verifiable Credential** в `.well-known/`:

| Файл | Назначение |
|---|---|
| `cosmic-passport.json` | Подписанный VC: appId, systemHash (SHA-256), constellation, biome, stars/planets, provenance (commitSha, builtAt, builder), nebula score |
| `cosmic-passport-key.json` | Публичный ключ (Ed25519VerificationKey2020, multibase) |
| `nebula-score.json` | Оценка 0-100 по 4 pillar: performance, accessibility, contentHealth, architecturalCompliance |
| `cosmic-star-map.svg` | Визуальная карта сайта (stars → planets → moons) |
| `dna-compliance.json` | DNA-compliance отчёт |

**Heartbeat:** после деплоя пингуется `https://webgogol.com/.well-known/cosmic-passport.json`.

Это значит, что **любой может криптографически проверить**, что сайт действительно принадлежит заявленному бизнесу, и что состав страниц соответствует заявленному манифесту.

---

## 10. Деплой и релиз

### Cloudflare Workers

- Hostnames: `webgogol.com`, `www.webgogol.com`
- Regional Services: EU-only (allowedZones: eu)
- Два канала: **main** (`https://webgogol.com`) и **alt** (`https://alt.webgogol.com`)
- SSG build → deploy to Workers

### Mission lifecycle

Изменения сайта идут через **missions** (эпизодические workpieces):

```
materialize → migrate → operator edits → validate → release.prepare → reconcile → close
```

- Workpiece — свежий git-репозиторий, коммиты на каждый шаг
- `release.prepare` — из workpiece (быстрый фидбек)
- `release.publish` — требует успешного reconcile
- `mission.close`/`abort` — git bundle в evidence/ (audit trail)
- Workpiece остаётся на диске для `mission.preview`

**Edits-only-through-missions:** прямые правки в Sternsystem-репозитории обнаруживаются и блокируются. Это гарантирует **аудируемый trail изменений**.

---

## 11. Валидация — что гарантирует клиент

Сайт проходит **многоуровневую валидацию** перед релизом:

- `entitlements.validate` — фичи из закрытого каталога
- `entitlement.module.validate` — blueprint-модули ≤ resolved entitlements
- `surface.contract.validate` — Layer C (внешние поверхности) не регрессирует
- `pseo.validate` — не более maxThinShare тонких страниц
- `content.references.validate` — `{collection.file.field}` ссылки валидны
- `faq.validate` — FAQ-контент
- `integration.config.validate` / `integration.secrets.validate` — интеграции
- `passport.verify` — VC подпись + systemHash
- `constellation.contract.validate` — констелляция соответствует биому
- `biome.contract.validate` — биом валиден
- DNA-compliance checks

---

## 12. Что клиент НЕ получает (критический взгляд)

### Ограничения модели

- **Нет CMS-интерфейса.** Контент редактируется в markdown-файлах. Клиент не получает WordPress-like админку. Изменения идут через missions (git-based workflow).
- **Нет runtime-динамики.** SSG = статика. Комментарии, user-generated content, real-time — только через внешние интеграции (UChat, Pipedrive).
- **Нет произвольного дизайна.** Биом определяет всё. Нельзя «просто поменять цвет кнопки» — только через токены/биом.
- **Нет произвольных страниц.** Каждая страница — блок-декларативная, с типизированными блоками. Нельзя вставить произвольный HTML/JS.
- **Языковые ограничения.** Биомы содержат `forbidPhrases` — определённые формулировки программно запрещены.
- **Гео-ограничения.** Cloudflare Regional Services EU-only — сайт физически обслуживается из EU. Для не-EU клиентов это ограничение.
- **Только 3 биома.** Выбор визуального языка ограничен каталогом. Новый биом — это RFC, не настройка.
- **Зависимость от экосистемы.** Сайт — composition shell. Всё логическое в `packages/*`. Обновление пакетов может сломать сайт (есть migrator registry, но это техническая зависимость).
- **Цена прозрачна, но не низкая.** 70€/мес + 200€ setup = 1040€ первый год. Для малого бизнеса в DE это вменяемо, но не «дёшево».

### Что клиент получает вместо этого

- **Воспроизводимость:** system.md → SSG build → идентичный сайт. Никакого «волшебного» кода.
- **Аудируемость:** каждый коммит, каждый mission, каждый release — в git history + Bordbuch.
- **Верифицируемость:** Cosmic Passport — криптографическая подпись состава сайта.
- **SEO-машину:** Programmatic Surface с 5 гейтами против мусорных страниц — не «сгенерировать 10000 страниц и надеяться», а «сгенерировать только страницы с доказательством, спросом и субстанцией».
- **AI-readiness:** llms.txt, agent.json, JSON-LD, crawler allowlist — сайт изначально построен для AI-ассистентов, не ретрофит.
- **Data residency:** EU-only, DSGVO-совместимо по архитектуре, а не по обещанию.
- **Ownership:** домен, данные, структурированные данные, Übergabepaket — всё у клиента. No lock-in как принцип, 30 дней расторжения.

---

## 13. Резюме для статьи

**Клиент WebStudio получает не «сайт» в классическом смысле, а инженерно собранную цифровую инфраструктуру:**

1. SSG-сайт на Astro с блок-декларативным контентом (редактируется без кода)
2. Дизайн-система из биома (токены, типографика, палитра, эффекты — с программными запретами на клише)
3. Констелляция — проверенная последовательность секций для конверсии
4. Мультиязычность (de + uk, расширяемо)
5. Полный семантический слой: JSON-LD, llms.txt, agent.json, sitemap, robots с AI-crawler allowlist
6. Programmatic Surface — авто-генерация SEO-страниц по гео-каскаду с 5 гейтами индексируемости
7. Интеграции: формы → Telegram → Pipedrive CRM, UChat, Matomo — всё EU-resident
8. Cosmic Passport — криптографически подписанная идентичность в .well-known/
9. Cloudflare Workers деплой, EU-only, main + alt каналы
10. Mission-based lifecycle — изменения через git-workpiece с audit trail
11. Многоуровневая валидация (entitlements, DNA, contracts, passport)
12. Открытая цена, Notausgang, ownership — всё в контенте, не в мелком шрифте

**Это не веб-визитка и не Baukasten. Это управляемая цифровая инфраструктура с инженерной дисциплиной — для бизнеса, который хочет владеть своим цифровым присутствием, а не арендовать его.**
