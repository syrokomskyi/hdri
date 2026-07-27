Да — здесь лучше дать агенту не просто список новых keywords, а **процедуру** расширения парсера: в текущем `branche-mapping.ts` классификация строится на substring-matching по нормализованной строке, без учёта структуры сайта, причём действует правило `first match wins` и уже заданы ограничения на короткие и двусмысленные ключи.
В приложенном CSV видно, что значительная часть “неклассифицируемых” значений — это не реальные отрасли, а шумовые directory-labels вроде `plzbereich4`, `plzbereich6`, `plzbereich8`, `plzbereich9`, слишком общие ярлыки вроде `hersteller-Lieferanten`, а также техничные bucket'ы вроде `arbeitssicherheit`, `handwerkersoftware`, `bankgewerbe`, `bauelemente`, `messebau`, `containerdienste`, `schluesseldienste`, `orthopaedie-schuhtechnik` и `messtechnik-regeltechnik`.

## Что ломает классификацию

Текущий маппер хорошо работает для ремесленных и локально-сервисных ключей, потому что в нём уже покрыты handwerk-ориентированные группы `BauAusbau`, `ShkElektro`, `KfzMetall`, `Nahrung`, `Gesundheit`, `Dienstleistung`, `Kreativ`, `HolzDesign`.
Но в CSV много случаев, где raw-`Branche` вообще не описывает бизнес: `hersteller-Lieferanten` встречается и у `metabo.com`, и у `lindt.de`, и у `vaillant.de`, и у `velux.de`, поэтому по одному этому полю классифицировать нельзя.
Отдельно нужно считать мусорными branch-labels типа `plzbereich0`–`plzbereich9`, потому что это явно не индустрии, а служебные группировки каталога.

## Инструкция агенту

1. Сохрани только 8 канонических групп: `BauAusbau`, `ShkElektro`, `KfzMetall`, `Nahrung`, `Gesundheit`, `Dienstleistung`, `Kreativ`, `HolzDesign`.
2. Не добавляй новые группы и не меняй семантику existing groups; расширяй только правила нормализации, список ignore-labels, exact-alias mapping и fallback-классификацию по title/domain.
3. Работай в четыре этапа: `raw branche -> exact branch alias -> domain/title keyword inference -> manual review queue`.  
4. Всегда нормализуй вход: lowercase, umlaut-folding (`ä->ae`, `ö->oe`, `ü->ue`, `ß->ss`), trim, collapse spaces, remove decorative punctuation и разбивай домен/тайтл на токены.
5. Если `raw branche` входит в ignore-list, не используй его для классификации вообще; сразу переходи к анализу `domain + site title`.
6. Если `raw branche` слишком общий, используй его только как слабый prior, а финальное решение принимай по смысловым токенам из title/domain.
7. Если и branch, и title/domain противоречат друг другу, приоритет отдавай title/domain, когда branch относится к шумовым bucket'ам каталога.
8. Добавляй новые keywords в mapper только по текущим правилам файла: избегай коротких строк, избегай распространённых фамилий как standalone-token, ставь более специфичные ключи раньше общих и проверяй риск ложных совпадений.

## Новые слои парсера

Добавь отдельный `IGNORE_RAW_BRANCHES` для служебных и заведомо бесполезных ярлыков.
В этот список должны входить как минимум `plzbereich0`, `plzbereich1`, `plzbereich2`, `plzbereich3`, `plzbereich4`, `plzbereich5`, `plzbereich6`, `plzbereich7`, `plzbereich8`, `plzbereich9`, а также похожие технические или географические placeholders, если они не описывают отрасль.

Добавь `RAW_BRANCH_ALIAS_MAP` для directory-bucket'ов, которые можно маппить сразу в одну группу.  
Рекомендуемые алиасы:

- `bankgewerbe` -> `Dienstleistung`.
- `handwerkersoftware` -> `Dienstleistung`.
- `handwerkskammer` -> `Dienstleistung`.
- `arbeitssicherheit` -> `Dienstleistung` по умолчанию.
- `orthopaedie-schuhtechnik` -> `Gesundheit`.
- `containerdienste` -> `Dienstleistung`.
- `schluesseldienste` -> `Dienstleistung`.
- `sachverstaendiger` / `sachverstaendige` -> `Dienstleistung`.
- `messebau` -> `Kreativ`.
- `fahrraeder und behindertenfahrzeuge` -> `KfzMetall`.
- `glas bearbeitung glas verarbeitung` -> `Kreativ`, потому что `glaserei` и `glaser` уже сидят в `Kreativ`.
- `messtechnik-regeltechnik` -> `KfzMetall`, если нет более сильного сигнала на `ShkElektro`.
- `baubetreuung` -> `BauAusbau`.
- `bauelemente` -> не маппить напрямую; разбирать по title/domain.
- `hersteller-Lieferanten` -> не маппить напрямую; разбирать по title/domain.

Добавь `TITLE_DOMAIN_KEYWORD_MAP` как второй, более сильный слой после raw-branch.  
Используй такие семейства токенов:

- `BauAusbau`: `fenster`, `tueren`, `rolladen`, `rollladen`, `wintergarten`, `treppen`, `zaun`, `tor`, `carport`, `fassade`, `abdichtung`, `abbruch`, `pflaster`, `dach`, `naturstein`, `geruest`, `balkon`, `bauabdichtung`.
- `ShkElektro`: `heizung`, `sanitaer`, `klima`, `klimatechnik`, `kaelte`, `elektro`, `elektrotechnik`, `blitzschutz`, `alarm`, `warnsysteme`, `fernmeldetechnik`, `solar`, `photovoltaik`, `energie`, `netzwerktechnik`.
- `KfzMetall`: `kfz`, `autohaus`, `reifen`, `karosserie`, `nutzfahrzeuge`, `metallbau`, `stahlbau`, `schweiss`, `zerspan`, `antriebstechnik`, `apparatenbau`, `maschinenbau`, `foerderanlagen`, `hydraulik`, `kran`, `waagenbau`, `werkzeug`, `vorrichtungsbau`, `fahrrad`, `zweirad`.
- `Nahrung`: `restaurant`, `bar`, `cafe`, `kaffee`, `tapas`, `partyservice`, `fleisch`, `wurst`, `honig`, `fisch`, `feinkost`, `olivenoel`, `senf`, `lebensmittel`, `imkerei`.
- `Gesundheit`: `arzt`, `hausarzt`, `augenarzt`, `urologie`, `zahnarzt`, `kieferorthopaed`, `praxis`, `psychotherapie`, `heilprakt`, `hypnose`, `naturheil`, `pflege`, `hospiz`, `sanitaetshaus`, `orthopaedie`, `brillen`, `optik`, `akupunktur`.
- `Dienstleistung`: `steuerberater`, `lohsteuerhilfe`, `rechtsanwalt`, `patentanwalt`, `makler`, `consulting`, `coaching`, `mediation`, `detektei`, `kurier`, `logistik`, `umzug`, `reinigung`, `hausmeisterservice`, `gebaeudereinigung`, `facility`, `personal`, `vermittlung`, `bank`, `sparkasse`, `volksbank`, `handwerkskammer`, `ihk`, `stadt`, `gemeinde`, `universitaet`.
- `Kreativ`: `werbeagentur`, `marketing`, `seo`, `webdesign`, `medien`, `druck`, `werbetechnik`, `messebau`, `dj`, `entertainment`, `musik`, `fotografie`, `grafik`, `design`, `bildhauer`, `grabmale`, `rahmen`, `theater`, `verlag`.
- `HolzDesign`: `tischlerei`, `schreinerei`, `moebel`, `kuechen`, `parkett`, `innenausbau`, `polster`, `holzbau`, `holzhandel`, `drechslerei`, `betten`, `matratzen`, `raumausstattung`.

## Правила для спорных bucket'ов

Для `hersteller-Lieferanten` агент обязан игнорировать сам ярлык и смотреть на title/domain, потому что в CSV под ним лежат и инструменты, и еда, и окна, и отопление, и электрика, и медтовары.
Если title/domain содержит производственный или компонентный vocab вроде `maschinen`, `hydraulik`, `zerspanung`, `antriebstechnik`, `apparatenbau`, `waagenbau`, `schweiss`, `foerderanlagen`, отправляй в `KfzMetall`.
Если title/domain содержит `fenster`, `rolladen`, `tor`, `tuer`, `carport`, `fassade`, `terrassendach`, `treppe`, `wintergarten`, отправляй в `BauAusbau`.
Если title/domain содержит `tischlerei`, `schreinerei`, `moebel`, `parkett`, `holz`, `kuechen`, отправляй в `HolzDesign`.
Если title/domain содержит `heizung`, `sanitaer`, `klima`, `elektro`, `solar`, `warnsysteme`, `fernmeldetechnik`, отправляй в `ShkElektro`.
Если title/domain содержит `honig`, `fleisch`, `fisch`, `back`, `kaffee`, `restaurant`, `cafe`, `lebensmittel`, отправляй в `Nahrung`.
Если title/domain содержит `medizin`, `praxis`, `arzt`, `zahnarzt`, `pflege`, `sanitaetshaus`, `orthopaedie`, отправляй в `Gesundheit`.

Для `bauelemente` агент должен сначала искать строительные элементы и монтаж, а потом уже дерево/металл, потому что в CSV внутри этого bucket'а много `Fenster`, `Türen`, `Treppenbau`, `Rolladen`, `Tischlerei`, `Schreinerei`, `Metallbau`.
Приоритет для `bauelemente` такой: `fenster/tueren/rolladen/treppen/zaun/wintergarten` -> `BauAusbau`; `tischlerei/schreinerei/moebel` -> `HolzDesign`; `metallbau/stahlbau/schlosserei` -> `KfzMetall`.

Для `arbeitssicherheit` ставь `Dienstleistung` по умолчанию, потому что в CSV под этим ярлыком встречаются консультанты, инженерные бюро, государственные учреждения, курсы и профильные поставщики.
Но если title/domain явно про техсистемы здания, например `alarm`, `sicherheitstechnik`, `warnsysteme`, `elektro`, допускается `ShkElektro` как override.

Для `messebau`, `werbetechnik`, `druck`, `seo`, `marketing`, `webdesign`, `promotion`, `digitale kommunikation` ставь `Kreativ`, потому что это медиа/реклама/event-контекст, а не общий `Dienstleistung`.
Для `orthopaedie-schuhtechnik`, `sanitaetshaus`, `zahntechnische geraete`, `aerzte*`, `heilpraktik`, `psychotherapie`, `pflege` ставь `Gesundheit`.

## Ограничения и формат результата

Агент не должен добавлять unsafe-keywords вроде `bau`, `technik`, `service`, `handel`, `praxis`, `studio`, `shop`, `media` как одиночные общие триггеры, потому что текущий файл уже предупреждает о ложных срабатываниях при слишком общих или коротких substrings.
Исключения допустимы только если keyword длинный, доменно-специфичный и проверен на collision risk.

Финальный результат агента должен состоять из четырёх частей.  
- `IGNORE_RAW_BRANCHES`: список мусорных branch-labels.
- `RAW_BRANCH_ALIAS_MAP`: exact mapping для полезных directory-bucket'ов.
- `TITLE_DOMAIN_KEYWORD_MAP`: keywords по title/domain для fallback-классификации.
- `REVIEW_QUEUE_RULES`: когда отправлять кейс на ручную проверку, например если сигналов меньше двух, если raw-branch шумовой и title/domain тоже общий, или если две группы набрали одинаковую силу.

Ниже готовая краткая формулировка задания для агента.

1. Расширь парсер без добавления новых групп; используй только `BauAusbau`, `ShkElektro`, `KfzMetall`, `Nahrung`, `Gesundheit`, `Dienstleistung`, `Kreativ`, `HolzDesign`.
2. Добавь отдельные списки `IGNORE_RAW_BRANCHES`, `RAW_BRANCH_ALIAS_MAP`, `TITLE_DOMAIN_KEYWORD_MAP`.  
3. Игнорируй служебные raw-labels типа `plzbereich*` и не классифицируй по ним.
4. Не маппь `hersteller-Lieferanten` и `bauelemente` напрямую; классифицируй их по title/domain.
5. Соблюдай правила текущего mapper'а: длинные и специфичные keywords, first-match-wins, более частные ключи выше общих, без коротких и двусмысленных токенов.
6. Для каждого нового keyword верни: `keyword`, `group`, `source_examples`, `risk_note`, `priority_order`.  
7. Для каждого кейса из low-confidence queue верни `suggested_group`, `reason`, `matched_signals`, `needs_manual_review`.  
