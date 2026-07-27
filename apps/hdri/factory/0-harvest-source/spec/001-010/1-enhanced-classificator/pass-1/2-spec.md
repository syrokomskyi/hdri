Ниже — готовый шаблон `SPEC.md` для агента. Он опирается на текущую архитектуру `branche-mapping.ts`: substring-matching по нормализованной строке, правило `first match wins`, запрет на короткие и двусмысленные ключи и фиксированный набор из 8 групп.
Шаблон также учитывает структуру проблемных данных из CSV: там много шумовых branch-labels вроде `plzbereich*`, overly-generic ярлыков вроде `hersteller-Lieferanten`, а также повторяющихся bucket'ов вроде `arbeitssicherheit`, `bankgewerbe`, `bauelemente`, `handwerkersoftware`, `messebau`, `orthopaedie-schuhtechnik`, которые нужно обрабатывать отдельными правилами.

## SPEC.md

```md
# SPEC: Expand German Industry Classifier

## Goal

Expand the industry parser so that more German business websites can be classified into the **existing** canonical groups only.

Allowed target groups:

- `BauAusbau`
- `ShkElektro`
- `KfzMetall`
- `Nahrung`
- `Gesundheit`
- `Dienstleistung`
- `Kreativ`
- `HolzDesign`

Do **not** introduce new groups.

The parser currently uses keyword-based substring matching against normalized Branche strings, and the **first match wins**. New logic must preserve this model and extend it safely.

---

## Existing Constraints

You must follow these rules exactly:

1. Keep the current 8-group taxonomy unchanged.
2. Preserve the current parser philosophy: deterministic mapping, substring-based matching, reviewable additions.
3. Respect `first match wins`: more specific rules must appear before more general ones.
4. Do not add short or ambiguous keywords.
5. Do not use common German surnames as standalone keywords.
6. Prefer trade-specific or suffixed forms such as:
   - `...technik`
   - `...betrieb`
   - `...praxis`
   - `...vermittlung`
   - `...beratung`
   - `...bau`
7. If a raw category is a directory artifact rather than a real industry, do not map it directly.

---

## Input Sources

The classifier may use these signals:

1. `rawBranche` — the raw industry/category string from the directory.
2. `siteTitle` — website or listing title.
3. `domain` — hostname/domain.
4. Optional nearby text snippets if available.

Use signals in this order:

1. Exact ignore check
2. Exact raw-branch alias mapping
3. Strong title/domain keyword inference
4. Manual review queue

---

## Normalization Rules

Before any matching:

1. Convert to lowercase.
2. Replace German umlauts:
   - `ä -> ae`
   - `ö -> oe`
   - `ü -> ue`
   - `ß -> ss`
3. Trim whitespace.
4. Collapse repeated whitespace to single spaces.
5. Replace punctuation, separators, and decorative characters with spaces:
   - `/`, `|`, `-`, `_`, `.`, `,`, `:`, `;`, `(`, `)`, `&`
6. Normalize multiple spaces again.
7. Create both:
   - a normalized full string
   - a token list
8. Normalize domain and title using the same rules.

Example:
- `Ärzte: Fachärzte für Urologie` -> `aerzte fachaerzte fuer urologie`
- `Schlüsseldienste` -> `schluesseldienste`

---

## Classification Pipeline

### Step 1 — Ignore non-industry raw labels

If `rawBranche` belongs to `IGNORE_RAW_BRANCHES`, ignore it as a classification source and continue with title/domain analysis.

These labels are not real industries; they are routing, region, or directory buckets.

Initial ignore list:

- `plzbereich0`
- `plzbereich1`
- `plzbereich2`
- `plzbereich3`
- `plzbereich4`
- `plzbereich5`
- `plzbereich6`
- `plzbereich7`
- `plzbereich8`
- `plzbereich9`

You may extend this list if new artifacts are found, but only if they are clearly not industries.

---

### Step 2 — Exact raw-branch alias mapping

If `rawBranche` exactly matches one of the known directory buckets below, classify using the mapped target group unless a stronger override rule applies later.

#### Direct aliases

- `bankgewerbe` -> `Dienstleistung`
- `handwerkersoftware` -> `Dienstleistung`
- `orthopaedie-schuhtechnik` -> `Gesundheit`
- `containerdienste` -> `Dienstleistung`
- `schluesseldienste` -> `Dienstleistung`
- `sachverstaendiger` -> `Dienstleistung`
- `sachverstaendige` -> `Dienstleistung`
- `abschlusspruefer` -> `Dienstleistung`
- `arbeitssicherheit` -> `Dienstleistung`
- `messebau` -> `Kreativ`
- `fahrraeder und behindertenfahrzeuge` -> `KfzMetall`
- `glas bearbeitung glas verarbeitung` -> `Kreativ`
- `messtechnik regeltechnik` -> `KfzMetall`
- `baubetreuung` -> `BauAusbau`
- `coaching` -> `Dienstleistung`
- `marketing` -> `Kreativ`
- `detektive` -> `Dienstleistung`
- `detekteien` -> `Dienstleistung`
- `websites` -> `Dienstleistung`
- `it systeme edv systeme` -> `Dienstleistung`

#### Weak aliases requiring title/domain confirmation

These raw categories are too broad to classify safely on their own:

- `hersteller lieferanten`
- `bauelemente`
- `sonstige dienstleistungen`
- `handel mit waren aller art`
- `einzelhandel`
- `kundendienst`

For these labels, do not finalize classification from `rawBranche` alone. Continue to Step 3.

---

### Step 3 — Title/domain keyword inference

When the raw category is ignored, weak, generic, or missing, infer the target group from `siteTitle` and `domain`.

Use **specific** and **reviewable** keyword families.

#### BauAusbau

Use when title/domain strongly indicates building trades, building components, exterior/interior construction elements, or structural work.

Strong keywords:
- `fenster`
- `tuer`
- `tueren`
- `rolladen`
- `rollladen`
- `wintergarten`
- `treppen`
- `treppenbau`
- `zaun`
- `zaunbau`
- `tor`
- `tore`
- `schiebetore`
- `carport`
- `fassade`
- `abdichtung`
- `abbruch`
- `pflaster`
- `naturstein`
- `geruest`
- `balkon`
- `bauelemente`
- `brunnenbau`

Examples:
- `schulze-bauelemente.de`
- `fensterhandel.de`
- `schilling-wintergarten.de`
- `carportfabrik.de`

#### ShkElektro

Use for electrical installation, sanitary/heating/climate, energy systems, telecom/security building systems.

Strong keywords:
- `heizung`
- `sanitaer`
- `klima`
- `klimatechnik`
- `kaelte`
- `elektro`
- `elektrotechnik`
- `alarm`
- `nachrichtentechnik`
- `fernmeldetechnik`
- `solar`
- `photovoltaik`
- `energie`
- `notstrom`
- `aggregat`
- `sicherheitstechnik`
- `netzwerk`
- `telefon`
- `warnsystem`

Examples:
- `xpando.de`
- `svs-funk.com`
- `carrier-rental-systems`
- `elektroboll-solar.de`

#### KfzMetall

Use for automotive, bicycle/2-wheel, metalworking, machinery, industrial components, fabrication, welding, technical assemblies.

Strong keywords:
- `kfz`
- `autohaus`
- `autodienst`
- `reifen`
- `karosserie`
- `nutzfahrzeug`
- `metallbau`
- `stahlbau`
- `schweiss`
- `schweisstechnik`
- `antriebstechnik`
- `apparatebau`
- `maschinenbau`
- `werkzeugmaschinen`
- `foerdertechnik`
- `hydraulik`
- `kran`
- `gelenkwellen`
- `armaturen`
- `industriearmaturen`
- `fahrrad`
- `zweirad`
- `bike`
- `ebike`

Examples:
- `russfilterreinigung.de`
- `metabo.com`
- `indorf-apparatebau.com`
- `ako-armaturen.de`
- `mopnroll.de`

#### Nahrung

Use for restaurants, bars, cafes, food products, food retail, fisheries, honey, butchery, beverages, food production.

Strong keywords:
- `restaurant`
- `bar`
- `cafe`
- `kaffee`
- `tapas`
- `partyservice`
- `fleisch`
- `wurst`
- `fisch`
- `fischzucht`
- `honig`
- `imkerei`
- `lebensmittel`
- `feinkost`
- `kaffeehaus`
- `metzgerei`
- `brauerei`
- `wein`
- `mosterei`

Examples:
- `waidlake.com`
- `fischers-le.de`
- `hollypowder.de`
- `lindt.de`

#### Gesundheit

Use for doctors, clinics, therapy, care, medical supplies, orthopedics, hearing/optics, psychiatry, healing practices.

Strong keywords:
- `arzt`
- `praxis`
- `hausarzt`
- `augenarzt`
- `urologie`
- `zahnarzt`
- `kieferorthopaed`
- `psychotherapie`
- `heilprakt`
- `hypnose`
- `naturheil`
- `pflege`
- `hospiz`
- `sanitaetshaus`
- `orthopaedie`
- `orthopaedieschuh`
- `zahntechnik`
- `aerzte`
- `brillen`
- `optik`
- `akupunktur`

Examples:
- `downtownclinic.de`
- `rotebuehlpraxis.de`
- `gesundheitszentrum-kupfer.de`
- `hospiz-haus-geborgenheit.de`

#### Dienstleistung

Use for office/business services, education, legal, finance, logistics, cleaning, public institutions, associations, consulting, recruiting, general services.

Strong keywords:
- `steuerberater`
- `lohnsteuerhilfe`
- `rechtsanwalt`
- `patentanwalt`
- `makler`
- `consulting`
- `coaching`
- `mediation`
- `detektei`
- `kurier`
- `logistik`
- `entsorgung`
- `containerdienst`
- `reinigung`
- `hausmeisterservice`
- `gebaeudereinigung`
- `facility`
- `personal`
- `vermittlung`
- `arbeitsvermittlung`
- `bank`
- `sparkasse`
- `volksbank`
- `ihk`
- `handwerkskammer`
- `gemeinde`
- `stadt`
- `universitaet`
- `schule`
- `nachhilfe`
- `uebersetzung`

Examples:
- `dpd.com`
- `immerschlau.de`
- `reviscon.de`
- `gemeinde-sonnenstein.de`

#### Kreativ

Use for media, marketing, web/design, print, event, exhibitions, art, entertainment, DJs, publishing, visual presentation.

Strong keywords:
- `werbeagentur`
- `marketing`
- `seo`
- `webdesign`
- `medien`
- `werbetechnik`
- `druck`
- `messebau`
- `dj`
- `musik`
- `fotografie`
- `grafik`
- `design`
- `bildhauer`
- `grabmale`
- `rahmen`
- `theater`
- `verlag`
- `signage`
- `aussenwerbung`

Examples:
- `salz-berlin.de`
- `wedomedia.de`
- `design-splash.de`
- `neon-wertz.de`

#### HolzDesign

Use for carpentry, joinery, furniture, kitchens, wood interiors, parquet, interior furnishing.

Strong keywords:
- `tischlerei`
- `schreinerei`
- `moebel`
- `kuechen`
- `parkett`
- `innenausbau`
- `holzbau`
- `holzhandel`
- `drechslerei`
- `polster`
- `betten`
- `matratzen`
- `raumausstattung`

Examples:
- `kuechenstudiobutter.de`
- `bohn-kuechen.de`
- `tischlerei-*.de`
- `schreinerei-*.de`

---

## Precedence Rules

When multiple signals match, apply these precedence rules:

1. Exact strong raw-branch alias beats title/domain heuristics.
2. Ignored raw branch never counts.
3. For weak raw branches (`hersteller lieferanten`, `bauelemente`, `einzelhandel`, etc.), title/domain wins.
4. If both title and domain point to the same group, increase confidence.
5. If two groups compete:
   - choose the more specific industrial signal over the more generic service signal
   - choose the product/trade signal over generic words like `service`, `systeme`, `handel`
6. If confidence is still low, send to review queue.

Examples:
- `hersteller lieferanten` + `lindt.de` -> `Nahrung`
- `bauelemente` + `tischlerei-...` -> `HolzDesign`
- `arbeitssicherheit` + `alarm` + `elektro` -> `ShkElektro`
- `marketing` + `seo` + `webdesign` -> `Kreativ`

---

## Forbidden Keywords

Do not add or rely on these as standalone classification triggers:

- `bau`
- `technik`
- `handel`
- `service`
- `studio`
- `praxis`
- `media`
- `shop`
- `online`
- `systeme`
- `gruppe`
- `gmbh`
- `agentur`
- `unternehmen`

These are too general and will create false positives.

They may appear as supporting evidence only when combined with stronger keywords.

---

## Review Queue Rules

Mark a case as `needs_manual_review = true` if any of the following is true:

1. Raw branch is ignored and no strong title/domain keyword matches.
2. Raw branch is weak/generic and only one weak keyword is found.
3. Two different target groups have equal strength.
4. The best match depends on a very short or ambiguous token.
5. The site title is brand-only and domain is non-descriptive.
6. The classifier would need a generic token to make the decision.

Examples for review:
- brand-only sites with `hersteller lieferanten`
- generic `consulting` without business context
- `service` pages without trade signal
- ambiguous retail without product signal

---

## Expected Output From Agent

The agent must return the following artifacts.

### 1. `IGNORE_RAW_BRANCHES`
A list of raw branch labels that must never be classified directly.

Format:
```ts
export const IGNORE_RAW_BRANCHES = new Set<string>([
  'plzbereich0',
  'plzbereich1',
  ...
]);
```

### 2. `RAW_BRANCH_ALIAS_MAP`
Exact aliases for directory bucket labels.

Format:
```ts
export const RAW_BRANCH_ALIAS_MAP: Record<string, GewerkGroup> = {
  'bankgewerbe': 'Dienstleistung',
  'orthopaedie-schuhtechnik': 'Gesundheit',
};
```

### 3. `TITLE_DOMAIN_KEYWORD_MAP`
A prioritized list of safe fallback keywords.

Format:
```ts
export const TITLE_DOMAIN_KEYWORD_MAP: ReadonlyArray<readonly [string, GewerkGroup]> = [
  ['treppenbau', 'BauAusbau'],
  ['notstrom', 'ShkElektro'],
  ['antriebstechnik', 'KfzMetall'],
];
```

### 4. `REVIEW_QUEUE_RULES`
A short implementation note describing when to stop and require manual review.

### 5. `CHANGESET_REPORT`
For every proposed keyword addition, return:

- `keyword`
- `group`
- `match_source` (`raw`, `title`, `domain`)
- `source_examples`
- `risk_note`
- `priority_order`
- `approved_for_merge` (`true` / `false`)

---

## Acceptance Criteria

A proposed parser extension is acceptable only if:

1. It improves recall on previously unclassified cases.
2. It does not add new target groups.
3. It does not depend on broad, collision-prone tokens.
4. It keeps deterministic behavior.
5. It can be reviewed as a small diff.
6. Every added keyword has at least one real example from the dataset.
7. Ambiguous cases remain reviewable instead of being forced into wrong classes.

---

## Implementation Notes

- Prefer exact raw-branch aliases before fuzzy logic.
- Treat title/domain inference as fallback, not as the first step.
- Keep keyword lists grouped by target class.
- Keep more specific keywords earlier than broader ones.
- Add comments for exceptional cases only.
- Do not silently reclassify existing stable mappings without evidence.

---

## Initial Priority Areas

Focus first on these high-impact problematic buckets:

- `plzbereich*`
- `hersteller-Lieferanten`
- `bauelemente`
- `arbeitssicherheit`
- `bankgewerbe`
- `handwerkersoftware`
- `orthopaedie-schuhtechnik`
- `messebau`
- `schluesseldienste`
- `containerdienste`
- `fahrraeder und behindertenfahrzeuge`

These appear repeatedly in the dataset and are likely to unlock a large share of currently unclassified cases.

---

## Deliverable

Produce:

1. a proposed parser design,
2. a safe keyword expansion,
3. a merge-ready code diff,
4. a list of still-ambiguous cases for manual review.
```

## Примечания

Этот шаблон специально удерживает модель **узкой**: не расширяет таксономию и заставляет агента сначала отсеивать мусорные branch-labels, а уже потом делать fallback по title/domain.
Это особенно важно для таких bucket'ов, как `hersteller-Lieferanten` и `plzbereich*`, потому что по CSV видно, что они объединяют бизнесы из совершенно разных секторов и сами по себе почти ничего не говорят о группе.