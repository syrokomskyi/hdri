Теперь у меня полный расклад по всем 48 записям. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/3331348/0ec902d1-3cb4-4cbb-84fe-1cd84afbd1ac/unclassified-after-pass-3.csv?AWSAccessKeyId=ASIA2F3EMEYEWQ3FMWWJ&Signature=GMG23QZAALIpMsCj3ZVw00cmBxc%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEAcaCXVzLWVhc3QtMSJHMEUCIQCS8I40RkF1u%2BV9ft27SRKoCcvCQsInn2q5E9OTOiqQ9gIgXeBvRCj5WXD1WjwGjpWnvldu1HT8cWUQ05Kew9EOzEcq%2FAQI0P%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw2OTk3NTMzMDk3MDUiDC8JfhQsmhjThgQpYirQBLZ7o%2BFCdrncmzr9WXoLgyhhMmuXkP%2F8D5UORrc%2FRTNmH7V598fBpEvFA6W7jsXnlSXftlDceNWXJny%2F61TB9b%2F9DQrf1s9if299STxZZEX5aAIIj%2BXDxTE2uAOmI7pDsVm5BnHBXC1QD0PsGSiC08mYAgctLV0HgeCDvGmiRlgUNbQTAKp5W6%2BttlP%2BGL0jA%2F6G1hT6abuqa8gjL1ZWaSNZIAdgyc61t1CEzFcvAztPlwksUeMxnL%2BlCXJTnHBl3z50YqRBdJra3JPxWwNZv8voZNYeNFE%2Bl95DroBsrptxX4M8QaYTj7KD9QwMd2SQ1Whrd09KiZkDHoVus12Xd%2FL0lf1HeXfV6bOGI7epGj%2BYovw61p8jjGz6pbUvNEN7Ort1V0yGfZe3HqskJ9J7aB43A7DY7H0qG6h94fPSTzMikr4Pw%2BkKKpnDbxzBsykxozgZ7OAULL1%2FKjtbt7TPYgx7PyJYOP3oie21fM17MJ717tn0oS8O7h2qTgHhvOvPwtRCaJtdPLcOrO2%2FhkspRaKzM2X%2FkBlzakFg3nD6SBI4DmgbjhQiSLl9eMWfale9BWLFTswB0JwCNDIR0f9ob1bc8kPsK5UmTif7g29rHFY4FizaVIgG75Lx%2FYmmQUz4YR23VGHCD%2Bf95j34DJ%2BDH3ht6n4rj6%2FmZw6urjVI8aEHwJ2IB5blB9AtFkDyKxK1cLAnRazXcdcEFDPNK%2FiJpzWtK2udHNRkmZELiaApozx%2FQNIstJ1IqoE%2BOon0vkhyHXpAZJ284nh4IBYByjko%2FpcwrMS%2FzwY6mAGINA6nz8A9BZ%2BHLVdex2wfVjoxQwTI6ajiNA1j%2F%2BoHw38D1ERnEEAItgLWonu984O89s%2FOukHLsDQNYgiIzzDC90Ceg0ZJ8VCbL6ZB7TctQlqBr2gYRIF81fU0I2sk8OnebtTtKSgtcKDFZk%2B2GDbw0EytLLs9DCJjWhQeCgGPR8wFHivrbVKWcdihaWSff4NjPoM2JdFqCA%3D%3D&Expires=1777330232)

***

## Главное наблюдение: 22 из 48 строк решаются двумя ключевыми словами

Категории `Gesundheit & Schönheit - *` (5 строк) и `Service & Personal - *` (10 строк) не матчатся, потому что нормализованный rawBranche `gesundheit schoenheit - manikuere pedikuere` проверяется против `ALL_SIGNALS_KEYWORD_MAP`, но подстроки `gesundheit schoenheit` и `service personal` в этом списке **отсутствуют**. Их длина ≥ 6 символов, substring-поиск сработает сразу. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/3331348/f2accc9f-a133-4341-982e-879fdf5b9e37/branche-mapping-2.ts)

**Добавить в `ALL_SIGNALS_KEYWORD_MAP`** (4 строки, покрывают 22 записи):

```typescript
// Покрывают ВСЕ подкатегории через substring-match в normalised rawBranche:
['gesundheit schoenheit',  'Gesundheit'],    // 5 строк
['service personal',       'Dienstleistung'],// 10 строк
['reise urlaub',           'Dienstleistung'],// 2 строки (flugreisen, hotels)
['party unterhaltung',     'Kreativ'],        // 4 строки (equipment, moderator, planung)
```

***

## Исключения из общих правил — в `RAW_BRANCH_ALIAS_MAP`

```typescript
// Конкретные подкатегории с другой группой (должны идти ДО keyword-match):
'reise urlaub - wohnmobile':       'KfzMetall',    // автодома = транспорт
'party unterhaltung - hostessen':  'Dienstleistung',// D.E.M. Security
```

***

## Классификация всех 48 строк

| rawBranche | domain / company | Группа | Как |
|---|---|---|---|
| Einkaufen & Sparen - Hobby & Garten | feuerschalen.ch | `Kreativ` | добавить `['feuerschal', 'Kreativ']` в keyword map |
| Einkaufen & Sparen - Hobby & Garten | naehmanufakturmuenchen.de | `Kreativ` | добавить `['naehmanufaktur', 'Kreativ']` или `['naehmaschine', ...]` уже есть — добавить `['naeh', 'Kreativ']` с word-boundary |
| Einkaufen & Sparen - Kleidung | *(оба)* | `Kreativ` | добавить alias `'einkaufen sparen - kleidung': 'Kreativ'` |
| Einkaufen & Sparen - Lebens & Genussmittel | *(оба)* | `Nahrung` | добавить `['genussmittel', 'Nahrung']` в keyword map |
| Einkaufen & Sparen - Sport | akw-fitness.de | `Gesundheit` | добавить `['fitness', 'Gesundheit']` *(7 chars, safe)* |
| Einkaufen & Sparen - Sport | guenstige-sportnahrung.at | `Nahrung` | добавить `['sportnahrung', 'Nahrung']` |
| Einkaufen & Sparen - Veranstaltungen & Karten | location-cham.de | `Dienstleistung` | alias `'einkaufen sparen - veranstaltungen karten': 'Dienstleistung'` |
| **Gesundheit & Schönheit - *** | *(5 строк)* | `Gesundheit` | **keyword `gesundheit schoenheit` (см. выше)** |
| Handel mit Waren aller Art | reformhaus-fuelle.de | `Nahrung` | добавить `['reformhaus', 'Nahrung']` |
| Handel mit Waren aller Art | lesezirkel-bohn.de | `Kreativ` | добавить `['lesezirkel', 'Kreativ']` |
| Haus & Garten - Pflanzen | Heckenpflanzen Ramaker | `Dienstleistung` | добавить `['heckenpflanz', 'Dienstleistung']` |
| Haus & Garten - Schädlingsbekämpfung | spinnenalarm.de | `Dienstleistung` | alias `'haus garten - schaedlingsbekaempfung': 'Dienstleistung'` |
| Haus & Garten - Sondermüll | 1aumzuege.de / Umzüge GmbH | `Dienstleistung` | добавить `['umzug', 'Dienstleistung']` |
| Haus & Garten - Zäune | sdh24.de | `BauAusbau` | **исправить уmlaut**: keyword `'zaeune'` вместо `'zäune'` |
| Haus- u. Grundstücksservice | mk-hausgartenservice.de | `Dienstleistung` | alias `'haus- u grundstuecksservice': 'Dienstleistung'` |
| Internet & IT Services - Cloud-Dienste | arbeitszeitrechner-24.de | `Dienstleistung` | alias `'internet it services': 'Dienstleistung'` (или keyword) |
| IT-Systeme / EDV-Systeme | michael-havers.de | `Dienstleistung` | alias `'it-systeme edv-systeme': 'Dienstleistung'` |
| Obst und Gemüse | frischeinsel.de | `Nahrung` | **исправить umlaut**: keyword `'obst und gemuese'` вместо `'obst und gemüse'` |
| Papierwaren, Erzeugung | fotofrenzel GmbH Fotohaus | `Kreativ` | **`papierwaren` только в alias (exact), но rawBranche = `papierwaren erzeugung`** → переместить в keyword map как substring |
| **Party & Unterhaltung - *** | *(5 строк)* | `Kreativ` / `Dienstleistung` | **keyword `party unterhaltung`** + исключение для hostessen |
| Produktion von Werbemitteln | folien-express.de | `Kreativ` | alias `'produktion von werbemitteln': 'Kreativ'` |
| **Reise & Urlaub - *** | *(4 строки)* | `Dienstleistung` / `KfzMetall` | **keyword `reise urlaub`** + исключение для wohnmobile |
| Reparatur Elektrogeräte / Haushaltsgeräte | mueller-hausgeraete.de | `ShkElektro` | добавить `['hausgeraet', 'ShkElektro']` |
| **Service & Personal - *** | *(10 строк)* | `Dienstleistung` | **keyword `service personal` (см. выше)** |
| Zweiräder | licornebike.com | `KfzMetall` | `Zweiräder` нормализуется в `zweiraeder`, но alias `zweirad` — не substring! Добавить alias `'zweiraeder': 'KfzMetall'` |

***

## Итоговый блок изменений

```typescript
// RAW_BRANCH_ALIAS_MAP — новые exact-записи:
'reise urlaub - wohnmobile':                   'KfzMetall',
'party unterhaltung - hostessen':              'Dienstleistung',
'einkaufen sparen - kleidung':                 'Kreativ',
'einkaufen sparen - veranstaltungen karten':   'Dienstleistung',
'haus garten - schaedlingsbekaempfung':        'Dienstleistung',
'haus- u grundstuecksservice':                 'Dienstleistung',
'internet it services':                        'Dienstleistung',
'it-systeme edv-systeme':                      'Dienstleistung',
'produktion von werbemitteln':                 'Kreativ',
'zweiraeder':                                  'KfzMetall',

// ALL_SIGNALS_KEYWORD_MAP — новые подстрочные ключевые слова:
['gesundheit schoenheit',  'Gesundheit'],
['service personal',       'Dienstleistung'],
['reise urlaub',           'Dienstleistung'],
['party unterhaltung',     'Kreativ'],
['genussmittel',           'Nahrung'],
['sportnahrung',           'Nahrung'],
['reformhaus',             'Nahrung'],
['fitness',                'Gesundheit'],    // 7 chars, safe
['hausgeraet',             'ShkElektro'],
['feuerschal',             'Kreativ'],
['lesezirkel',             'Kreativ'],
['heckenpflanz',           'Dienstleistung'],
['umzug',                  'Dienstleistung'],// 5 chars → word-boundary mode
['naehmanufaktur',         'Kreativ'],

// Исправить umlaut-баги в существующих ключевых словах:
// 'obst und gemüse'  → 'obst und gemuese'
// 'zäune'           → 'zaeune'
// + все остальные из предыдущего списка 36 сломанных ключевых слов
```

Также **переместить `papierwaren` из alias в keyword map** — тогда `papierwaren erzeugung` совпадёт как substring.
