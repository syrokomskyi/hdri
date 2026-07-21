## 1. Сравнительный TCO

- **What is missing:** внешне проверенное сравнение стоимости Webgogol, агентств, фрилансеров, Baukasten и нишевых SaaS на одинаковом наборе функций.
- **Why it matters for the article:** без этого нельзя утверждать, что модель радикально дешевле или экономически выгоднее.
- **Possible workarounds:** говорить о предсказуемой структуре расходов; использовать арифметику собственной цены; рыночные диапазоны подавать только при наличии источников и с оговорками.

---

## 2. Рыночные цены DACH

- **What is missing:** подтверждённые источники по ценам на сайты, поддержку, retainers, SEO, pSEO и CMS-сопровождение в Германии/DACH.
- **Why it matters for the article:** статья сравнивает инженерную модель с рынком; без источников сравнение будет выглядеть как голословное.
- **Possible workarounds:** убрать точные диапазоны или пометить их как ориентировочные; заменить на качественное сравнение моделей.

---

## 3. ROI и окупаемость

- **What is missing:** данные о лидах, продажах, конверсии, сроке окупаемости, revenue impact.
- **Why it matters for the article:** нельзя обещать бизнес-результаты без доказательств.
- **Possible workarounds:** говорить не о росте продаж, а о снижении технической неопределённости, управляемости и готовности инфраструктуры.

---

## 4. Клиентские кейсы

- **What is missing:** реальные внедрения, отзывы, до/после, измеримые эффекты.
- **Why it matters for the article:** кейсы могли бы подтвердить практическую ценность модели.
- **Possible workarounds:** писать как авторскую инженерную позицию и описание принципов, не как доказанный market outcome.

---

## 5. Влияние SSG на безопасность

- **What is missing:** внешние источники или аудит, сравнивающий риски SSG и CMS в конкретном контексте.
- **Why it matters for the article:** нельзя упрощённо утверждать, что WordPress небезопасен, а SSG безопасен всегда.
- **Possible workarounds:** формулировать точнее: SSG уменьшает класс runtime-рисков, связанных с базой данных, серверной генерацией и плагинами.

---

## 6. BFSG-применимость

- **What is missing:** юридическая проверка применимости BFSG к конкретным типам клиентов, услуг и сайтов.
- **Why it matters for the article:** неверная юридическая формулировка может ввести бизнес в заблуждение.
- **Possible workarounds:** писать «с учётом BFSG-контекста» и «снижает риск», а не «гарантирует соответствие».

---

## 7. WCAG / EN 301 549 соответствие

- **What is missing:** accessibility-аудит, результаты автоматических и ручных проверок, statement of conformance.
- **Why it matters for the article:** доступность нельзя доказать только архитектурным намерением.
- **Possible workarounds:** говорить о встроенных инженерных мерах: контраст, семантика, focus states, keyboard navigation, reduced motion.

---

## 8. DSGVO compliance

- **What is missing:** юридический аудит, DPA, TOMs, consent flows, data-processing register.
- **Why it matters for the article:** DSGVO — юридический режим, а не только техническая настройка.
- **Possible workarounds:** писать «архитектура проектируется с учётом DSGVO», не «DSGVO-compliant гарантированно».

---

## 9. Data residency всех потоков PII

- **What is missing:** полный data-flow audit по Cloudflare, Upstash, Supabase, Pipedrive, Telegram, email, Matomo, UChat, логам и бэкапам.
- **Why it matters for the article:** утверждение «каждый байт остаётся в EU» требует строгого доказательства.
- **Possible workarounds:** заменить на «EU-oriented infrastructure» или «данные маршрутизируются через EU-resident компоненты там, где это предусмотрено конфигурацией».

---

## 10. Cloudflare Regional Services конфигурация

- **What is missing:** подтверждение фактических настроек Cloudflare, allowed zones, логирования, edge processing, subprocessors.
- **Why it matters for the article:** Cloudflare как глобальная сеть требует точного описания data locality.
- **Possible workarounds:** упоминать Cloudflare Regional Services как архитектурный выбор, не как абсолютную гарантию.

---

## 11. Upstash / Supabase / Pipedrive residency

- **What is missing:** фактические регионы, DPA, subprocessors, backup policies.
- **Why it matters for the article:** интеграции могут разрушить заявленную EU-residency модель.
- **Possible workarounds:** описывать pipeline как проектируемый с EU-резидентностью; не утверждать полное физическое удержание данных без аудита.

---

## 12. Telegram как канал уведомлений

- **What is missing:** анализ DSGVO-рисков при передаче данных в Telegram.
- **Why it matters for the article:** Telegram может быть проблемным каналом для PII.
- **Possible workarounds:** не утверждать DSGVO-безопасность Telegram; писать, что каналы уведомлений требуют настройки и consent/data-minimization.

---

## 13. AI Overviews / AI-search статистика

- **What is missing:** проверенные источники по доле AI Overviews, CTR impact, поведению AI-ассистентов.
- **Why it matters for the article:** статья может выглядеть спекулятивной, если опирается на неподтверждённые цифры.
- **Possible workarounds:** убрать числа; оставить тренд: поиск становится более машинно-посредованным.

---

## 14. Parse rate статического HTML против JavaScript

- **What is missing:** источник и методология по заявленным parse rates.
- **Why it matters for the article:** сильное техническое утверждение требует доказательств.
- **Possible workarounds:** писать мягче: статический HTML проще читать краулерам и AI-парсерам, чем контент, зависящий от client-side rendering.

---

## 15. Uplift от `llms.txt`, FAQ schema, таблиц

- **What is missing:** источники и исследования, подтверждающие проценты uplift.
- **Why it matters for the article:** нельзя обещать прирост AI-цитирования.
- **Possible workarounds:** говорить, что эти элементы улучшают структурированность и машиночитаемость.

---

## 16. Статус `llms.txt`

- **What is missing:** подтверждение официального статуса стандарта.
- **Why it matters for the article:** термин «стандарт» может быть некорректен.
- **Possible workarounds:** называть `llms.txt` emerging practice или machine-readable convention.

---

## 17. Статус `llms-full.txt`

- **What is missing:** внешнее подтверждение распространённости и принятой спецификации.
- **Why it matters for the article:** нельзя выдавать внутреннюю практику за отраслевую норму.
- **Possible workarounds:** описывать как дополнительный текстовый индекс сайта для AI-ассистентов.

---

## 18. Статус `.well-known/agent.json`

- **What is missing:** спецификация, совместимость, поддержка агентами.
- **Why it matters for the article:** иначе утверждение об agent surface может быть технически спорным.
- **Possible workarounds:** писать «структурированный discovery-документ для будущих/поддерживаемых агентных сценариев».

---

## 19. MCP compatibility

- **What is missing:** точное описание связи `.well-known/agent.json` с MCP и поддерживаемыми tools/actions.
- **Why it matters for the article:** MCP имеет собственную модель; нельзя смешивать термины.
- **Possible workarounds:** писать «MCP-oriented» или «совместимость зависит от реализации», если нет спецификации.

---

## 20. Безопасность agent actions

- **What is missing:** auth model, consent model, scopes, rate limits, audit logs, abuse prevention.
- **Why it matters for the article:** agent actions без модели безопасности могут быть риском.
- **Possible workarounds:** упоминать agent actions только как entitlement/направление, не как гарантированно готовую универсальную возможность.

---

## 21. Programmatic SEO results

- **What is missing:** индексация, rankings, traffic data, case studies, Search Console evidence.
- **Why it matters for the article:** нельзя утверждать эффективность pSEO без результатов.
- **Possible workarounds:** описывать pSEO как управляемую архитектуру допуска страниц, не как гарантированный SEO-результат.

---

## 22. Риск thin content

- **What is missing:** внешняя SEO-валидация того, что пять гейтов достаточно защищают от thin content.
- **Why it matters for the article:** Google может оценивать качество иначе.
- **Possible workarounds:** писать «снижают риск» и «создают внутренний контроль качества», не «предотвращают санкции».

---

## 23. Оптимальность pSEO thresholds

- **What is missing:** эмпирические данные по minVolume, substance score, freshness SLA, top-K budget.
- **Why it matters for the article:** конкретные пороги могут быть спорными.
- **Possible workarounds:** не раскрывать пороги как универсальные; описывать их как настраиваемые правила допуска.

---

## 24. Evidence gate / Werk-доказательства

- **What is missing:** структура доказательств, источники данных, критерии достоверности.
- **Why it matters for the article:** «доказательная база» должна быть не риторикой, а проверяемым набором фактов.
- **Possible workarounds:** объяснить принцип: страница не должна индексироваться без достаточного фактического основания.

---

## 25. LLM-enrichment provenance

- **What is missing:** процесс утверждения, журнал источников, способ заморозки, ответственность за ошибки.
- **Why it matters for the article:** LLM-контент может галлюцинировать.
- **Possible workarounds:** говорить, что enrichment происходит build-time и требует валидации, а не генерируется произвольно в runtime.

---

## 26. Влияние design constraints на конверсию

- **What is missing:** A/B-тесты, conversion tracking, qualitative research.
- **Why it matters for the article:** нельзя утверждать доказанный рост конверсии.
- **Possible workarounds:** описывать constraints как защиту от нарушения бренд-коммуникации и визуальной консистентности.

---

## 27. Эффективность `handwerk-trust-funnel`

- **What is missing:** данные тестов, кейсы, методология.
- **Why it matters for the article:** слово «проверенная» требует доказательств.
- **Possible workarounds:** заменить на «спроектированная последовательность доверительного объяснения».

---

## 28. Клиентское восприятие mission lifecycle

- **What is missing:** интервью, usability feedback, скорость обработки правок, onboarding данные.
- **Why it matters for the article:** для владельца малого бизнеса git-based workflow может быть барьером.
- **Possible workarounds:** честно признать, что это не CMS-свобода, а дисциплинированный процесс изменений.

---

## 29. Удобство Markdown/YAML для клиента

- **What is missing:** данные о том, кто реально редактирует контент — клиент или студия.
- **Why it matters for the article:** «CMS-friendly» не равно «удобно владельцу бизнеса».
- **Possible workarounds:** формулировать как «структурно редактируемый формат», а не как полноценная CMS для нетехнического пользователя.

---

## 30. Отсутствие CMS как преимущество

- **What is missing:** сегментация клиентов, которым это действительно подходит.
- **Why it matters for the article:** часть аудитории хочет визуальный редактор.
- **Possible workarounds:** сказать прямо: если бизнес хочет сам двигать блоки мышкой каждый день, модель не для него.

---

## 31. Vendor lock-in через `packages/*`

- **What is missing:** точный состав экспортного пакета, лицензии, возможность независимой сборки без внутренней экосистемы.
- **Why it matters for the article:** нельзя утверждать полное отсутствие lock-in.
- **Possible workarounds:** говорить о снижении lock-in через открытый контент, экспорт и Notausgang, признавая зависимость от пакетов.

---

## 32. Notausgang details

- **What is missing:** состав экспортируемых данных, формат передачи, права на дизайн/код/токены, SLA выхода.
- **Why it matters for the article:** ownership должен быть технически и договорно конкретным.
- **Possible workarounds:** описывать Notausgang как принцип и процесс; не обещать больше, чем закреплено в договоре.

---

## 33. Юридическая сила Cosmic Passport

- **What is missing:** доверительная модель, связь публичного ключа с юридическим лицом, признание третьими сторонами.
- **Why it matters for the article:** криптографическая подпись не равна юридическому доказательству владения.
- **Possible workarounds:** писать, что Passport проверяет состав и происхождение артефакта, а не заменяет договоры и реестры.

---

## 34. Проверяемость «любым человеком»

- **What is missing:** публичный инструмент проверки, документация, UX процесса проверки.
- **Why it matters for the article:** если проверка требует специальных знаний, утверждение «любой может проверить» преувеличено.
- **Possible workarounds:** писать «технически проверяемо» или «может быть проверено инструментом».

---

## 35. Nebula Score

- **What is missing:** методология оценки, веса показателей, воспроизводимость score.
- **Why it matters for the article:** score без методологии выглядит как внутренний маркетинговый показатель.
- **Possible workarounds:** не акцентировать score; упоминать как внутренний отчёт качества.

---

## 36. DNA compliance

- **What is missing:** спецификация DNA compliance, критерии, аудит.
- **Why it matters for the article:** термин может быть непонятен внешней аудитории.
- **Possible workarounds:** переводить в бизнес-язык: «проверки соответствия архитектурным правилам».

---

## 37. Entitlements fail-closed

- **What is missing:** доказательство поведения сборки, покрытие тестами, edge cases.
- **Why it matters for the article:** сильное техническое обещание требует уверенности.
- **Possible workarounds:** описывать как принцип проектирования: платная функция не должна тихо исчезать из сборки.

---

## 38. Stripe Entitlements dependency

- **What is missing:** политика отказоустойчивости Stripe, offline build behavior, fallback-процедуры.
- **Why it matters for the article:** зависимость от внешнего billing-провайдера может стать операционным риском.
- **Possible workarounds:** не углубляться в Stripe; говорить о модульном управлении доступными функциями.

---

## 39. Реальная доступность трёх биомов

- **What is missing:** актуальный каталог биомов, maturity status, примеры production-сайтов.
- **Why it matters for the article:** ограниченность визуального выбора — важный trade-off.
- **Possible workarounds:** честно сказать, что визуальный язык выбирается из ограниченного каталога.

---

## 40. Масштабируемость новых биомов

- **What is missing:** процесс создания нового биома, сроки, стоимость, критерии acceptance.
- **Why it matters for the article:** бизнес может спросить, возможен ли уникальный бренд.
- **Possible workarounds:** объяснить: новый биом — инженерная работа, а не «поменять цвет кнопки».

---

## 41. Производительность сайтов

- **What is missing:** Lighthouse/PageSpeed/WebPageTest результаты, Core Web Vitals.
- **Why it matters for the article:** SSG подразумевает performance-преимущество, но нужны измерения.
- **Possible workarounds:** не заявлять конкретные баллы; говорить о предпосылках высокой производительности.

---

## 42. Uptime и SLA

- **What is missing:** SLA по доступности, мониторинг, incident response.
- **Why it matters for the article:** цифровая инфраструктура предполагает эксплуатационные гарантии.
- **Possible workarounds:** не обещать SLA, если он не закреплён; говорить об архитектуре деплоя и процессах релиза.

---

## 43. Backup / restore

- **What is missing:** политика бэкапов, restore drills, RPO/RTO.
- **Why it matters for the article:** управляемая инфраструктура должна иметь понятный recovery-процесс.
- **Possible workarounds:** если данных нет, не поднимать тему восстановления или описать как область для будущего уточнения.

---

## 44. Security audit

- **What is missing:** независимый аудит кода, зависимостей, supply chain, secrets handling.
- **Why it matters for the article:** криптография и SSG не закрывают все security-вопросы.
- **Possible workarounds:** говорить о снижении классов риска, не об абсолютной безопасности.

---

## 45. Supply chain security

- **What is missing:** SBOM, dependency scanning, signing pipeline, provenance attestation beyond Cosmic Passport.
- **Why it matters for the article:** если используется язык supply chain security, нужны технические доказательства.
- **Possible workarounds:** ограничить тезис: Passport фиксирует provenance конкретного сайта.

---

## 46. Сравнение с конкурентами

- **What is missing:** систематический конкурентный аудит Webflow, Framer, WordPress-агентств, Handwerker-SaaS, enterprise headless.
- **Why it matters for the article:** нельзя утверждать «никто не предлагает» без проверки.
- **Possible workarounds:** говорить «редко встречается в стандартных пакетах малого бизнеса» и фокусироваться на собственной категории.

---

## 47. Конструкторы и lock-in

- **What is missing:** конкретные правила экспорта данных у Wix, Jimdo, Squarespace, Webflow, Framer и других платформ.
- **Why it matters for the article:** blanket claims о lock-in могут быть несправедливыми.
- **Possible workarounds:** говорить о риске lock-in через закрытые форматы и аккаунты, а не обвинять все платформы одинаково.

---

## 48. Агентства и скрытый lock-in

- **What is missing:** доказательства типичных практик агентств, контрактные условия, кейсы.
- **Why it matters for the article:** нельзя обобщать рынок как недобросовестный.
- **Possible workarounds:** писать нейтрально: lock-in часто возникает не злонамеренно, а из-за CMS, плагинов, кастомного кода и отсутствия документации.

---

## 49. Применимость для неевропейских клиентов

- **What is missing:** latency data, CDN strategy, legal constraints outside EU.
- **Why it matters for the article:** EU-only может быть преимуществом для DACH и ограничением для global.
- **Possible workarounds:** позиционировать модель как особенно релевантную для Германии/EU.

---

## 50. Граница между клиентской ценностью и внутренней инфраструктурой

- **What is missing:** чёткое разделение, какие элементы клиент реально видит/получает, а какие служат студии.
- **Why it matters for the article:** статья не должна продавать внутреннюю сложность как ценность без объяснения.
- **Possible workarounds:** каждый технический элемент переводить в бизнес-последствие: стоимость, контроль, проверяемость, снижение хаоса, машинная читаемость.
