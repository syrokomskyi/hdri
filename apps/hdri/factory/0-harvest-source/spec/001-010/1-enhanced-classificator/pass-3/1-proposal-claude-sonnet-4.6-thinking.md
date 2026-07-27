Теперь у меня полная картина всех проблем. Вот они конкретно.

***

## Найдено 4 класса проблем

### 1 — Системный баг: умлауты в ключевых словах никогда не совпадают

Это самая массовая проблема. `normaliseForMatch` конвертирует умлауты в ASCII (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`), но ключевые слова в `ALL_SIGNALS_KEYWORD_MAP` остаются с умлаутами. Результат: `normalised.includes(keyword)` — вечно `false`.

**36 сломанных ключевых слов**, примеры:

| Keyword в map | Реальный normalised | Работает? |
|---|---|---|
| `'bäckerei'` | `'baeckerei'` | ❌ |
| `'zäune'` | `'zaeune'` | ❌ |
| `'türen'` | `'tueren'` | ❌ |
| `'gerüst'` | `'geruest'` | ❌ |
| `'gebäudetechnik'` | `'gebaeudetechnik'` | ❌ |
| `'kältetechnik'` | `'kaeltetechnik'` | ❌ |
| `'bäder'` | `'baeder'` | ❌ |
| `'schweißerei'` | `'schweisserei'` | ❌ |
| `'möbel'` | `'moebel'` | ❌ |
| `'küchen'` | `'kuechen'` | ❌ |

**Исправление** — либо нормализовать keyword внутри `matchesKeyword`:
```typescript
const matchesKeyword = (normalised: string, keyword: string): boolean => {
  const normalisedKeyword = normaliseForMatch(keyword); // ← добавить
  if (normalisedKeyword.length >= 6) {
    return normalised.includes(normalisedKeyword);
  }
  // ... word boundary logic с normalisedKeyword
};
```
Либо заменить все умлауты в map-файле вручную (менее надёжно).

***

### 2 — Три конкретных опечатки в `RAW_BRANCH_ALIAS_MAP`

**Опечатка 1**: `Arbeitsbühnenverleih` нормализуется в `arbeitsbuehnenverleih`, но в alias записано `arbeitsbuehnverlei` — потеряли `en` посередине и `h` в конце.

```typescript
// БЫЛО (не работает):
arbeitsbuehnverlei: 'BauAusbau',

// НАДО:
arbeitsbuehnenverleih: 'Dienstleistung',  // + правильный группа (Schindler = Garten/Haus)
```

**Опечатка 2**: `Bödenbeläge` нормализуется в `boedenbelaege` (`ö→oe`), но alias написан как `bodenbelaege` — пропущено `oe`.

```typescript
// БЫЛО (не работает):
bodenbelaege: 'BauAusbau',

// НАДО (добавить второй вариант):
boedenbelaege: 'BauAusbau',
```

**Опечатка 3**: Мусорный ключ `antiquitaeten2` — это не существующий rawBranche.

***

### 3 — Два IGNORE-записи указаны в неправильной normalised-форме

`normalise("Wirtschafts- u. Berufsverbände")` → `wirtschafts- u berufsverbaende` (`ä→ae` → `verbaende`)

Но в `IGNORE_RAW_BRANCHES` написано `wirtschafts- u berufsverbande` (одно `a` вместо `ae`). Никогда не совпадёт.

```typescript
// БЫЛО (не матчится):
'wirtschafts- u berufsverbande'

// НАДО:
'wirtschafts- u berufsverbaende'
```

Аналогично — `Kirchen u. religiöse Gemeinschaften` и `Erfurt` не в IGNORE вообще, хотя явно должны быть.

***

### 4 — Структурная проблема: IGNORE → `tryAllSignals` → `null` ≠ «пропустить»

Когда `kreishandwerkerschaft`, `fachverbaende`, `handelskammern` попадают в IGNORE, код вызывает `tryAllSignals`. Сигнала нет → `null` → pipeline пишет `unclassified`. Эти 273 строки **будут навсегда в unclassified** — потому что это объединения, а не предприятия.

Нужно различать два типа результата — **«не удалось классифицировать»** и **«не нужно классифицировать»**:

```typescript
// Вариант А: отдельный экспорт для проверки
export const isIgnoredRawBranche = (raw: string): boolean =>
  IGNORE_RAW_BRANCHES.has(normaliseForMatch(raw ?? ''));

// Тогда в pipeline:
if (isIgnoredRawBranche(row.rawBranche) && !classifyBrancheFromSignals(row)) {
  continue; // не добавлять в unclassified output
}

// Вариант Б: возвращать sentinel 'ignored' (не null)
// в STEP 1 возвращать 'ignored' вместо tryAllSignals(...)
// pipeline пропускает строки с 'ignored'
```
