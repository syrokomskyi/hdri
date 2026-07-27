
# Инструкция для AI: Кардинальное улучшение классификатора Gewerk-групп

## 1. Контекст и цель

Цель — довести долю unclassified строк до нуля (или близко к нулю).
В распоряжении классификатора три сигнала для каждой записи:
- `rawBranche` — категория из бизнес-каталога (напр. `elektrohandwerk`, `bauelemente`)
- `domain` — домен сайта (напр. `schlosserei-rueter.de`)
- `siteTitle` / `companyName` — название компании или заголовок страницы (напр. `Glaserei Bley`)

Классификатор должен использовать ВСЕ три сигнала, а не только `rawBranche`.

---

## 2. Диагностика: Почему строки остаются unclassified

### Причина 1 — Пробел в BRANCHE_KEYWORD_MAP
`elektrohandwerk` не совпадает ни с одним ключевым словом в `BRANCHE_KEYWORD_MAP`, потому что там есть
`elektriker`, `elektrobetrieb`, `elektrotechnik` — но нет `elektrohandwerk` как подстроки ни в одном из них
(ни одно из этих слов не является подстрокой `elektrohandwerk`).
Результат: сотни строк с очевидным `ShkElektro` остаются unclassified.

### Причина 2 — TITLE_DOMAIN_KEYWORD_MAP слишком мала и не содержит критичных торговых терминов
Для `bauelemente` (WEAK) классификатор переходит к TITLE_DOMAIN_KEYWORD_MAP — но в ней отсутствуют:
`schlosserei`, `glaserei`, `glaser`, `zimmerei`, `zimmerer`, `tischler` (без суффикса `-ei`),
`schreiner` (без `-ei`), `dachdecker`, `sonnenschutz`, `holztechnik`, `metallbau`, `blechdach` и т.д.
Домены типа `schlosserei-rueter.de`, `glaserei-bley.de`, `zimmerei-priess.de` → не классифицируются.

### Причина 3 — Название компании (companyName) вообще не является отдельным сигналом
В типе `BrancheClassificationInput` есть только `siteTitle` и `domain`.
Но название компании из директории (3-я колонка CSV) — сильнейший сигнал:
"Glaserei Bley", "Tischlermeister ROST", "Zimmerei Priess GmbH" и т.д.
Этот сигнал сейчас либо не передаётся, либо объединён с `siteTitle` без гарантии.

### Причина 4 — Пропущены alias-записи для целых категорий
Следующие rawBranche значения встречаются во множестве строк, но отсутствуют в `RAW_BRANCH_ALIAS_MAP`:
- `elektrohandwerk` → `ShkElektro`
- `bauelemente` → WEAK (правильно), но компенсация через title/domain неполная
- `bausachverstaendiger` → `Dienstleistung`
- `berufsgenossenschaft` → `Dienstleistung`
- `Entruempelungsdienste` → `Dienstleistung`
- `baumschulen` → `Dienstleistung`
- `Bautaetigkeiten` → `BauAusbau`
- `Bauen & Renovieren - Abrissarbeiten` → `BauAusbau`
- `Bauen & Renovieren - Ausbesserungen` → `BauAusbau`
- `Bauen & Renovieren - Bodenbelaege` → `BauAusbau`
- `Bauen & Renovieren - Elektrik & Elektronik` → `ShkElektro`
- `Bauen & Renovieren - Kanalarbeiten` → `ShkElektro`
- `Bauen & Renovieren - Klima & Lueftung` → `ShkElektro`
- `Bauen & Renovieren - Laden & Messebau` → `Kreativ`
- `Bauen & Renovieren - Rohbau` → `BauAusbau`
- `Bauen & Renovieren - Rolllaeden` → `BauAusbau`
- `Bauen & Renovieren - Solarthermie` → `ShkElektro`
- `Bauen & Renovieren - Sonstiges` → `BauAusbau`
- `Bauen & Renovieren - Strassenbau` → `BauAusbau`
- `Bauen & Renovieren - Baustelleneinrichtung` → `BauAusbau`
- `Bauen & Renovieren - Bautrocknung` → `BauAusbau`
- `Baugeruest / Geruestbau` → `BauAusbau`
- `alternative Therapie` / `Alternative und komplementaere Therapien` → `Gesundheit`
- `Arzt` / `Aerzte: Frauenartz` / `Aerzte: Hausaerzte` → `Gesundheit`
- `Aerztebedarf` / `Aerztedienstleistungen` / `Aerztepraexiseinrichtungen` → `Gesundheit`
- `Abendkurse` / `Arabisch` → `Dienstleistung`
- `Abholstelle` → `Dienstleistung`
- `Arbeitnehmerüberlassung` → `Dienstleistung`
- `Arbeitsbühnenverleih` → `Dienstleistung`
- `Anhänger` / `Anhänger-Arbeitsbühnen` → `KfzMetall`
- `AU` (Hauptuntersuchung / TÜV) → `KfzMetall`
- `Auslichtungen` → `Dienstleistung`
- `Altlasten` → `Dienstleistung`
- `Antiquitäten` → `Kreativ`
- `Apparate` → нужна проверка через title/domain (напр. MediaMarkt → Dienstleistung)
- `APEX`, `ACER` → только через title/domain
- `Bar` → `Nahrung`
- `Bäder` → `ShkElektro`
- `Baubeschläge` → `BauAusbau`

---

## 3. Что нужно переписать

### 3.1 `BrancheClassificationInput` — добавить `companyName`

```typescript
export type BrancheClassificationInput = {
  rawBranche?: string | null;
  siteTitle?: string | null;
  domain?: string | null;
  companyName?: string | null;   // ← НОВОЕ: название компании из директории
};
```

### 3.2 Новый пайплайн в `classifyBrancheFromSignals`

Алгоритм должен работать по следующей чёткой приоритетной лестнице:

```
STEP 1: rawBranche → normalise → IGNORE_RAW_BRANCHES? → skip
STEP 2: rawBranche (normalised) → RAW_BRANCH_ALIAS_MAP (exact match) → result
STEP 3: rawBranche (normalised) → BRANCHE_KEYWORD_MAP (substring) → result
         (только если rawBranche не в WEAK_RAW_BRANCHES)
STEP 4: ALL_SIGNALS_KEYWORD_MAP против siteTitle → result
STEP 5: ALL_SIGNALS_KEYWORD_MAP против companyName → result  ← НОВОЕ
STEP 6: ALL_SIGNALS_KEYWORD_MAP против domain → result
STEP 7: rawBranche (normalised) → ALL_SIGNALS_KEYWORD_MAP (substring) → result
         (даже если rawBranche в WEAK — как последний шанс)
STEP 8: return null
```

Где `ALL_SIGNALS_KEYWORD_MAP` — **единый объединённый** список ключевых слов (см. п. 3.3).

Ключевое изменение логики:
- WEAK rawBranche означает "не доверяй категории — копай в названии/домене"
- После провала на rawBranche **применять полный BRANCHE_KEYWORD_MAP** (не урезанный TITLE_DOMAIN_KEYWORD_MAP) к siteTitle, companyName и domain
- Порядок: siteTitle → companyName → domain (от самого информативного к менее)

### 3.3 `branche-mapping-2.ts` — объединить и расширить карты ключевых слов

**Удалить** `TITLE_DOMAIN_KEYWORD_MAP` как отдельную структуру.
**Создать** `ALL_SIGNALS_KEYWORD_MAP` = слияние текущего `BRANCHE_KEYWORD_MAP` + всех записей из
`TITLE_DOMAIN_KEYWORD_MAP` + нижеперечисленные новые записи.

Новые ключевые слова для добавления в карту (примеры из реальных unclassified данных):

**BauAusbau:**
- `glaserei` → `BauAusbau` (Glaserei Bley, Glaserei Burger — стекольные работы в строительстве)
  ОСТОРОЖНО: `glaserei` должна идти ПОСЛЕ более специфичных вхождений типа `glasmaler`/`glaskunst` → `Kreativ`
- `glaser` → `BauAusbau` (6 chars)
- `glasbau` → `BauAusbau`
- `zimmerei` → `BauAusbau`
- `zimmerer` → `BauAusbau`
- `zimmermeister` → `BauAusbau`
- `dachdecker` → `BauAusbau`
- `dachdeckerei` → `BauAusbau`
- `bedachungen` → `BauAusbau`
- `stuckateur` → `BauAusbau`
- `sonnenschutz` → `BauAusbau`
- `markisen` → `BauAusbau`
- `toranlagen` → `BauAusbau`
- `tortechnik` → `BauAusbau`
- `torsystem` → `BauAusbau`
- `schmiede` → `BauAusbau` (Kunstschmiede, Bauschlosserei)
  ОСТОРОЖНО: не перекрыть `schmied` → `KfzMetall` (Hufschmied)
- `schlosserei` → ... сложный случай! Баuschlosserei → `BauAusbau`, Kfz-Schlosserei → `KfzMetall`.
  Рекомендация: добавить `bauschlosserei` → `BauAusbau` ВЫШЕ `schlosserei` → `KfzMetall`.
- `terrassenueberdat` → `BauAusbau`
- `wintergarten` уже есть ✓
- `modulbau` → `BauAusbau`
- `fertigteile` → `BauAusbau`
- `elementebau` → `BauAusbau`
- `holzfenster` → `BauAusbau`
- `haustuer` → `BauAusbau`
- `tuertech` → `BauAusbau`
- `tueranlage` → `BauAusbau`
- `zargen` → `BauAusbau`
- `schiebetuer` → `BauAusbau`
- `schutztore` → `BauAusbau`
- `scherengitter` → `BauAusbau`
- `blechdach` → `BauAusbau`
- `vordach` → `BauAusbau`
- `terrassendach` → `BauAusbau`
- `carport` уже есть ✓
- `gartenhaus` → `BauAusbau`
- `stuckprofil` → `BauAusbau`
- `dachsanierung` → `BauAusbau`
- `geruest` уже есть ✓

**HolzDesign:**
- `tischler` → `HolzDesign` (без суффикса -ei: Tischlermeister, Tischlerwerkstatt)
- `schreiner` → `HolzDesign` (без суффикса -ei: Schreinermeister)
- `holzwerkstatt` → `HolzDesign`
- `holzbearbeitung` → `HolzDesign`
- `holzkunst` → `HolzDesign`
- `holzland` → `HolzDesign`
- `holzarbeit` → `HolzDesign`
- `holzzaun` → `HolzDesign`

**KfzMetall:**
- `metallgest` → `KfzMetall` (Metallgestaltung — обработка металла)
- `metallverarbeit` → `KfzMetall`
- `metalltechnik` → `KfzMetall`
- `schlosserei` → `KfzMetall` (общий fallback, ниже `bauschlosserei`)
- `stahlzarge` → `KfzMetall`
- `schmiedeeisen` → `KfzMetall`
- `schaltanlagen` → `KfzMetall`
- `schaltschrank` → `KfzMetall`
- `anlagentechnik` → `KfzMetall`
- `krantechnik` → `KfzMetall`
- `foerdertechn` → `KfzMetall`
- `verladetechn` → `KfzMetall`

**ShkElektro:**
- `elektrohandw` → `ShkElektro` (elektrohandwerk — самый частый пропущенный случай!)
- `gebaeudetechnik` → `ShkElektro`
- `haustechnik` → `ShkElektro`
- `notstrom` → `ShkElektro`
- `schornstein` → `ShkElektro`
- `kaminkehrer` → `ShkElektro`
- `lueftung` → `ShkElektro`
- `lueftungstech` → `ShkElektro`
- `kaeltetech` → `ShkElektro`

**Nahrung:**
- `gastronomie` → `Nahrung`
- `bäckerei` / `baeckerei` → `Nahrung`
- `konditorei` → `Nahrung`
- `catering` → `Nahrung`
- `getränk` / `getraenk` → `Nahrung`

**Gesundheit:**
- `praxis` → `Gesundheit` (осторожно: короткое слово, только в длинных составных)
- `therapeut` → `Gesundheit`
- `therapie` → `Gesundheit`
- `sanitaetsges` → `Gesundheit`
- `hoergeraet` → `Gesundheit`
- `physiotherap` → `Gesundheit`
- `ergotherap` → `Gesundheit`
- `logopaedie` → `Gesundheit`
- `osteopathie` → `Gesundheit`

**Dienstleistung:**
- `ruempelun` → `Dienstleistung` (Entrümpelung)
- `entruempel` → `Dienstleistung`
- `haushaltsaufloes` → `Dienstleistung`
- `gebaeudeservice` → `Dienstleistung`
- `hausservice` → `Dienstleistung`
- `hausmeisterdienst` → `Dienstleistung`
- `dienstleistung` → `Dienstleistung`
- `galabau` → `Dienstleistung` (Garten- und Landschaftsbau)
- `landschaftsbau` → `Dienstleistung`
- `gartenbau` → `Dienstleistung`
- `baumschulen` → `Dienstleistung`
- `baumpfleg` → `Dienstleistung`
- `sachverstaendig` → `Dienstleistung`
- `gutachter` → `Dienstleistung`
- `ingenieurbuer` → `Dienstleistung`
- `abbruchunternehmen` → `Dienstleistung`

### 3.4 `RAW_BRANCH_ALIAS_MAP` — новые записи

Добавить следующие exact-match записи (normalised форма → GewerkGroup):

```typescript
// ShkElektro
'elektrohandwerk': 'ShkElektro',

// BauAusbau
'bautaetigkeit': 'BauAusbau',
'bautaetigkeiten': 'BauAusbau',
'baugeruest': 'BauAusbau',
'geruestbau': 'BauAusbau',
'bausachverstaendiger': 'Dienstleistung',  // ← Gutachter, kein Handwerk
'bausachverstaendige': 'Dienstleistung',

// Gesundheit
'arzt': 'Gesundheit',
'aerzte': 'Gesundheit',
'aerztebedarf': 'Gesundheit',
'aerztedienstleistungen': 'Gesundheit',
'aerztepraexiseinrichtungen': 'Gesundheit',
'alternative therapie': 'Gesundheit',
'alternative und komplementaere therapien': 'Gesundheit',

// Nahrung
'bar': 'Nahrung',
'baeder': 'ShkElektro',  // ← Bäder-Ausrüstung, nicht Schwimmbad!

// Dienstleistung
'abendkurse': 'Dienstleistung',
'abholstelle': 'Dienstleistung',
'arbeitnehmerüberlassung': 'Dienstleistung',
'arbeitsbühnenverleih': 'Dienstleistung',
'auslichtungen': 'Dienstleistung',
'altlasten': 'Dienstleistung',
'berufsgenossenschaft': 'Dienstleistung',
'entruempelungsdienste': 'Dienstleistung',
'baumschulen': 'Dienstleistung',

// KfzMetall
'anhaenger': 'KfzMetall',
'au': 'KfzMetall',  // ← Hauptuntersuchung (TÜV/DEKRA), < 6 chars — использовать с осторожностью!
                    // Лучше: добавить через TITLE_DOMAIN: ['dekra', 'KfzMetall'], ['tuev', 'KfzMetall']

// Kreativ
'antiquitaeten': 'Kreativ',
'antiquitäten': 'Kreativ',
```

### 3.5 Обработка multi-word raw branches с подкатегориями

Категории вида `"Bauen & Renovieren - Abrissarbeiten"` нормализуются в
`"bauen renovieren abrissarbeiten"`. Текущий `matchKeywordList` пробует
части через split по `/ , & |` — но символ `-` не входит в разделители!

**Fix**: добавить `-` как разделитель при split:
```typescript
const parts = raw.split(/[\/,&|\-]/);
```

Тогда `"Bauen & Renovieren - Abrissarbeiten"` разбивается на
`["Bauen ", " Renovieren ", " Abrissarbeiten"]` — и каждая часть
обрабатывается через ключевые слова. `"Abrissarbeiten"` → можно
добавить ключевое слово `abrissarbeiten` → `BauAusbau`.

Также нужны ключевые слова для всей серии "Bauen & Renovieren":
```typescript
// В BRANCHE_KEYWORD_MAP (применяется к rawBranche):
['abrissarbeiten', 'BauAusbau'],
['ausbesserungen', 'BauAusbau'],   // ремонт/отделка
['bodenbelaege', 'BauAusbau'],
['bautrocknung', 'BauAusbau'],
['baustelleneinrichtung', 'BauAusbau'],
['rohbau', 'BauAusbau'],
['strassenbau', 'BauAusbau'],      // уже есть straßenbau — проверить нормализацию
['solarthermie', 'ShkElektro'],
['kanalarbeiten', 'ShkElektro'],
['rolllaeden', 'BauAusbau'],
['laden messebau', 'Kreativ'],     // составной — ищется как подстрока
['elektrik elektronik', 'ShkElektro'],
```

---

## 4. Общие правила безопасности (для AI, генерирующего новые ключевые слова)

1. **Минимальная длина ключевого слова — 6 символов** в `ALL_SIGNALS_KEYWORD_MAP`
   (для rawBranche можно 4+ если это профессиональный термин: `kfz`, `arzt`, `bad`).
2. **Специфичные слова — выше общих** в списке: `bauschlosserei` должно быть
   ДО `schlosserei`, `glasmaler` ДО `glaserei`, `dachsanierung` ДО `sanierung`.
3. **Тест на ложные срабатывания** для коротких слов:
   - `arzt` → в `raumausstatter`? Нет. В `kindergartenarzt`? Да — ок.
   - `bad` → в `fachbad`? Ок. В `bad kreuznach` (город)? Риск.
     → Используй `baeder`, `badezimmer`, `badsanierung` вместо `bad`.
4. **Немецкие составные слова**: суффиксная форма (`…betrieb`, `…meister`, `…werkstatt`)
   предпочтительнее корневой формы (`schreiner` → лучше `schreinermeister` или `schreinerei`).
   Но для случаев `bauelemente` с company name "Der Schreiner Maus" —
   нужна и корневая форма `schreiner`, поэтому добавить обе.
5. **Проверка через CSV**: после каждой серии добавлений — прогнать через unclassified список
   и убедиться, что новые ключевые слова не классифицируют ничего ошибочно.

---

## 5. Итоговая структура файлов после рефакторинга

### `gewerk-groups-4.ts` — без изменений

### `classify-3.ts` (полностью переписать логику):
```typescript
export type BrancheClassificationInput = {
  rawBranche?: string | null;
  siteTitle?: string | null;
  domain?: string | null;
  companyName?: string | null;   // ← новый сигнал
};

// Новый пайплайн (псевдокод):
export const classifyBrancheFromSignals = (input): GewerkGroup | null => {
  const raw  = norm(input.rawBranche);
  const title = norm(input.siteTitle);
  const co   = norm(input.companyName);
  const dom  = norm(input.domain);

  if (!raw || IGNORE_RAW_BRANCHES.has(raw)) {
    // Нет rawBranche → сразу к сигналам title/co/domain
    return tryAllSignals(title, co, dom);
  }

  // Exact alias
  const alias = RAW_BRANCH_ALIAS_MAP[raw];
  if (alias) return applyOverride(alias, title, dom);

  // Keyword match на rawBranche (только если не WEAK)
  if (!WEAK_RAW_BRANCHES.has(raw)) {
    const m = matchKeywords(raw, BRANCHE_KEYWORD_MAP, input.rawBranche);
    if (m) return m;
  }

  // Fallback: искать по title, company name, domain
  const fallback = tryAllSignals(title, co, dom);
  if (fallback) return fallback;

  // Последний шанс: keyword match на rawBranche даже если WEAK
  return matchKeywords(raw, BRANCHE_KEYWORD_MAP, input.rawBranche);
};

const tryAllSignals = (title, co, dom): GewerkGroup | null =>
  matchKeywords(title, ALL_SIGNALS_KEYWORD_MAP, ...) ??
  matchKeywords(co,    ALL_SIGNALS_KEYWORD_MAP, ...) ??
  matchKeywords(dom,   ALL_SIGNALS_KEYWORD_MAP, ...);
```

### `branche-mapping-2.ts`:
- **Удалить** `TITLE_DOMAIN_KEYWORD_MAP` как отдельный экспорт
- **Переименовать** `BRANCHE_KEYWORD_MAP` → `ALL_SIGNALS_KEYWORD_MAP`
  (или создать `ALL_SIGNALS_KEYWORD_MAP = [...BRANCHE_KEYWORD_MAP, ...former_TITLE_DOMAIN_KEYWORD_MAP]`)
- **Добавить** все новые ключевые слова из п. 3.3
- **Добавить** все новые alias-записи из п. 3.4
- **Убедиться** что порядок: специфичные → общие

---

## 6. Приоритет реализации

1. Добавить `elektrohandwerk` в `RAW_BRANCH_ALIAS_MAP` → немедленно классифицирует ~150+ строк
2. Добавить `companyName` как сигнал и подключить к пайплайну → охватит `bauelemente`-компании
3. Добавить `glaserei`, `glaser`, `zimmerei`, `zimmerer`, `tischler`, `schreiner`,
   `dachdecker`, `schlosserei`, `bauschlosserei` в `ALL_SIGNALS_KEYWORD_MAP`
4. Добавить все multi-word `Bauen & Renovieren - *` aliases
5. Добавить `-` как разделитель в `matchKeywordList`
6. Прогнать через полный unclassified CSV и устранить оставшиеся случаи

