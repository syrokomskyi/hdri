# Что получает Клиент сайта, сделанного этой Мастерской

## 1. Сайт — декадный цифровой актив

Не «лендинг», а **долгоживущий, самокомпонующийся крайне быстрый сайт** (Astro 6, статическая генерация, Cloudflare Workers). Сайт состоит из готовых секций-архетипов:

**35 секций-архетипов** (выбираются по `type` в frontmatter):
- **hero** — главный экран
- **send-message** — форма контакта с валидацией в реальном времени
- **price-card** — ценовые карточки
- **faq-list** — список вопросов-ответов
- **trust-strip** — полоса доверия
- **video-section** — видео-секции с субтитрами
- **people** — профили команды
- **comparison-cards** — сравнительные карточки
- **audience-cards** — карточки аудитории
- **social-proof** — социальное доказательство
- **open-source-registry** — реестр open-source
- **donation-card** / **donation-use** — карточки пожертвований
- **mountain-journey** — визуальное путешествие
- **notausgang-block** — блок «аварийного выхода»
- **changelog** — журнал изменений
- **markdown** — произвольный prose
- **breadcrumbs**, **navigation**, **toc**, **final-cta**, **gratitude**, **impact**, **transparency**, **approach**, **problem**, **ownership-block**, **service-metadata-block**, **controlled-responsibility-block**, **dynamic-status-block**, **hero-decision-card**, **article-header**, **article-list**, **credits-gallery**

## 2. Многоязычность из коробки

- Язык по умолчанию — без префикса (`/`), дополнительные — под `/<lang>/` (например `/uk/`)
- Контент: `pages/`, `prose/`, `business-profile/`, `site/`, [navigation/](cci:9://file:///home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/domain/ui/sections/navigation:0:0-0:0) — всё с переводами
- Переключатель языков, локализованная навигация, SEO-метаданные на каждом языке

## 3. Доверие и верификация — «Космический Паспорт»

- **Cosmic Passport** — криптографически подписанный цифровой паспорт сайта (Ed25519). Клиент получает страницу `/cosmic/passport` с:
  - **Passport Provenance** — происхождение и подпись
  - **Passport Score Grid** — оценка доверия по измерениям
  - **Passport Star Map** — визуальный граф связей сайта
- **Nachweis-System** (модуль `nachweis`):
  - `/nachweise` — реестр доказательств
  - [/nachweis-detail](cci:9://file:///home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/domain/ui/components/nachweis-detail:0:0-0:0) — детальная страница доказательства
  - [/nachweis-verify](cci:9://file:///home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/domain/ui/components/nachweis-verify:0:0-0:0) — проверка подписи и timestamp (RFC 3161 / eIDAS qualified)
  - Хэш-цепочка, Bordbuch (append-only журнал операций)

## 4. Agent Surface — сайт, читаемый ИИ-агентами

Каждый развёрнутый сайт публикует **машинно-читаемую поверхность**:
- `/.well-known/agent.json` — подписанный манифест возможностей
- `/.well-known/agent.openapi.json` — OpenAPI 3.1
- `/api/agent/mcp` — stateless MCP endpoint (JSON-RPC 2.0)
- `/api/agent/actions/<id>` — прямые HTTP action routes
- `/api/agent/v1/<domain>.json` — knowledge JSON (company, contact, faq, legal, location, offer, people, web)
- `/llms.txt`, `/llms-full.txt`, `/ai.txt` — LLM-текстовая поверхность
- `/<route>/index.md` — Markdown-близнецы страниц
- Векторный поиск (`/api/agent/search`, Workers AI `bge-m3`)

**Действие, которое может вызвать агент:** `lead.submit` — отправить контактную заявку (name, email, message) через Integration Port сайта.

## 5. Visitor Funnel — воронка продаж

- Stripe-интеграция для биллинга
- Лиды, чат-сообщения, платежи → нормализованный `IntegrationEvent` → маршрутизируется в назначения Клиента (Pipedrive, каналы, email) через **EU-resident Upstash QStash + Redis**
- Сайт Клиента — это хаб, не студийный сервис. Токены Клиента, назначения Клиента.

## 6. Платные модули (entitlements, через Stripe)

| Модуль | Что даёт Клиенту |
|---|---|
| `blog` | Блог / Ratgeber-статьи |
| `pseo` | Programmatic SEO — до 1000+ индексируемых страниц |
| `team.profiles` | Профили команды |
| `offer` | Структурированные предложения (Angebot) |
| `booking` | Бронирование консультаций |
| `trust` | Расширенные блоки доверия |
| `i18n-extra` | Дополнительные языки |
| `integrations.channels` | Интеграция с каналами (Slack, email и т.д.) |
| `integrations.crm` | CRM-интеграция (Pipedrive и т.д.) |
| `integrations.chat` | Consent-gated chat widget |
| `analytics` | Analytics (Matomo) |
| `automation` | Автоматизация |
| `agent.actions` | AI-агенты могут вызывать действия |
| `nachweis` | Реестр доказательств |
| `multi-currency` | Мультивалютные цены |
| `external-link-qr` | QR-коды для внешних ссылок |

## 7. Доступность и комплаенс

- WCAG-проверки, ARIA-атрибуты, нумерация секций для скринридеров
- Юридические страницы (Impressum, Datenschutz, AGB, Barrierefreiheit) с `semanticType: legal`
- EU-resident обработка данных
- `X-Robots-Tag: noindex` на dev/alt — Google не индексирует staging
- Retired routes (410 Gone / 301 redirect) — устаревшие страницы не теряются

## 8. Производительность и надёжность

- Статическая генерация (SSG) → мгновенная загрузка
- Cloudflare Workers с CDN, cache purging после деплоя
- Кеш сборки для повторных деплоев
- Retry с backoff для Cloudflare деплоев
- Fingerprinting для cache busting
- Оптимизированные видео: MP4 (двухпроходный, bitrate-capped), WebM, AV1, HLS, poster-кадры
- Адаптивные изображения

## 9. Check Warpgogol — отдельный продукт

Веб-приложение: принимает URL → отображает отчёт проверок. Backend runner в `services/check-runner` (Node/Playwright). Потребляет локальные очереди, пишет артефакты в `.check-warpgogol/runs/<runId>/`.

## 10. Операционная модель

- **Миссии** — каждое изменение сайта проходит через миссию: workpiece → validate → reconcile → close → release → certify → deploy
- **Три канала деплоя**: dev → alt → main (последовательное продвижение)
- **Bordbuch** — append-only хэш-цепочка журнала операций сайта
- **Зеркала** — git-зеркалирование (cache clone → bare repo → external GitHub)

---

# На сайте warpgogol есть страница доказательств. Там мы опубликовали два теста и баллы по ним. Что это за тесты и чем они полезны для сайта?

---

## 1. Lighthouse — Performance Audit

**Slug:** `lighthouse-wg-lh-01`
**Провайдер:** Google Lighthouse CLI v12.2.1
**Режим:** operator-run (запущен оператором)
**Запусков:** 5, агрегация — медиана

**Баллы:**

| Измерение | Балл | Диапазон (5 запусков) |
|---|---|---|
| **Performance** | 99 | 90–100 |
| **Accessibility** | 100 | 100 (все 5 запусков) |
| **Best Practices** | 96 | 96 (все 5 запусков) |
| **SEO** | 92 | 92 (все 5 запусков) |
| **Общий** | **97** | good |

**Что измеряет:** производительность, доступность, лучшие практики и SEO-готовность главной страницы `https://warpgogol.com` по методологии Google Lighthouse.

**Что НЕ доказывает:** это точечная (point-in-time) оценка. Результаты могут меняться между запусками — поэтому 5 прогонов и медиана.

---

## 2. Agent Readiness — Technical Assessment

**Slug:** `cloudflare-cf-ar-01`
**Провайдер:** Cloudflare (isitagentready.com)
**Режим:** provider-run (выполнен провайдером Cloudflare)
**Запусков:** 1

**Баллы:**

| Измерение | Результат | Оценка |
|---|---|---|
| **Discoverability** | 4/4 | pass |
| **Content Accessibility** | 1/1 | pass |
| **Bot Access Control** | 2/2 | pass |
| **Discovery** | 8/8 | pass |
| **Общий** | **100** | pass |

**Что измеряет:** готовность сайта к взаимодействию с ИИ-агентами — могут ли агенты обнаружить сайт, прочитать его контент, и правильно ли настроен доступ для ботов. Это прямой аудит Agent Surface (RFC-0286..0292): `/.well-known/agent.json`, `llms.txt`, `robots.txt`, MCP endpoint и т.д.

**Что НЕ доказывает:** тоже point-in-time. Проверяется структура и доступность, не семантика контента.

---

## Чем они полезны для сайта

1. **Доверие через измеримые факты.** Вместо утверждений «быстрый сайт» — конкретные баллы Lighthouse 97/100 с 5 прогонами и медианой. Вместо «готов к ИИ» — 15/15 от Cloudflare Agent Readiness Checker.

2. **Криптографическая верификация.** Каждый тест — это Nachweis-запись с:
   - **SHA-256 хешем** исходных данных (Lighthouse JSON, Cloudflare submission)
   - **Operator-подписью** (Ed25519) — подтверждает, что запись от Warpgogol
   - **RFC 3161 timestamp** — фиксирует момент публикации
   - **Sichtpass** — снимок видимости сайта на момент измерения
   - Проверить можно на [/nachweis-verify](cci:9://file:///home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/domain/ui/components/nachweis-verify:0:0-0:0) — независимая криптографическая проверка

3. **Приватное хранение сырых данных.** Полные JSON-результаты (5 Lighthouse-прогонов, Cloudflare submission) хранятся в R2 (`warpgogol-com/private/assessments/...`) с SHA-256 хешами. Публичный манифест содержит только баллы и метаданные — сырые данные доступны по запросу с верификацией хеша.

4. **Демонстрация возможностей платформы.** Сайт Warpgogol — это dogfooding: студия использует собственный Nachweis-модуль на себе. Клиент видит, что та же инфраструктура, которую он получит, уже работает и прошла внешнюю проверку.

5. **История наблюдений.** Bordbuch сайта содержит регулярные Sichtpass-события (`nachweisCount: 2`), отслеживающие, что оба теста остаются опубликованными и актуальными на каждом релизе.
