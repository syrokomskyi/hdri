/**
 * Central term collection (glossary) — single source of truth.
 *
 * Rendered in two places:
 *  1. Inline via the <Term/> component (ⓘ popover on click).
 *  2. As a standalone page /glossar (alphabetical, no duplicates).
 *
 * Uniqueness is guaranteed by `id`. Add new terms here —
 * they appear automatically in the glossary and are linkable via <Term id="…"/>.
 */

export type GlossaryLink = {
  label: string;
  href: string;
  /** true = external source (opens in a new tab). */
  external?: boolean;
};

export type GlossaryEntry = {
  /** Stable anchor/reference key, kebab-case. Anchor: /glossar#<id> */
  id: string;
  /** Display name of the term. */
  term: string;
  /** Alternative spellings/synonyms — for search and deduplication. */
  aliases?: string[];
  /** Thematic group (display/filter only). */
  category: 'Statistik' | 'Datenschutz' | 'Index' | 'Recht & Technik';
  /** Short definition for the inline popover (1–3 sentences, plain text). */
  short: string;
  /** Optional extended text for the glossary page. */
  long?: string;
  /** Curated, working sources. Internal (/methodik#…) first. */
  links?: GlossaryLink[];
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'hdri',
    term: 'HDRI',
    aliases: ['Handwerk Digital Reife Index', 'Handwerk Digital Readiness Index'],
    category: 'Index',
    short:
      'Handwerk Digital Reife Index — ein deskriptiver Quartalsindex der digitalen Reife deutscher Handwerkswebsites auf einer Skala von 0 bis 100. Kein Ranking einzelner Betriebe und kein SEO-Score.',
    links: [{ label: 'Methodik: Was der HDRI ist', href: '/methodik' }],
  },
  {
    id: 'p75',
    term: 'P75 (75. Perzentil)',
    aliases: ['P75', '75. Perzentil', 'Perzentil'],
    category: 'Statistik',
    short:
      'Der Wert, unter dem 75 % der gemessenen Websites liegen und über dem die besten 25 % liegen. Primäre Kennzahl des HDRI, weil sie robust gegen Ausreißer ist und ein ambitioniertes, aber erreichbares Niveau anzeigt.',
    long:
      'Berechnung via linearer Interpolation (Type 7, R-Standard): pos = (n − 1) × 0,75. Im Gegensatz zum Mittelwert wird P75 nicht von Einzelwerten verzerrt.',
    links: [
      { label: 'Methodik: Warum P75', href: '/methodik' },
      { label: 'Quantil / Perzentil (Wikipedia)', href: 'https://de.wikipedia.org/wiki/Quantil', external: true },
    ],
  },
  {
    id: 'median',
    term: 'Median (P50)',
    aliases: ['Median', 'P50', '50. Perzentil', 'Zentralwert'],
    category: 'Statistik',
    short:
      'Der mittlere Wert einer der Größe nach sortierten Verteilung: 50 % liegen darunter, 50 % darüber. Robust gegen Ausreißer und beschreibt das „typische" Niveau.',
    links: [{ label: 'Median (Wikipedia)', href: 'https://de.wikipedia.org/wiki/Median', external: true }],
  },
  {
    id: 'mittelwert',
    term: 'Mittelwert',
    aliases: ['Arithmetisches Mittel', 'Durchschnitt', 'Mean'],
    category: 'Statistik',
    short:
      'Das arithmetische Mittel aller Werte (Summe ÷ Anzahl). Zeigt die Schwerpunktlage der Verteilung, ist aber empfindlich gegenüber Ausreißern. Liegt der Mittelwert deutlich unter P75, ist die Verteilung linksschief.',
    links: [
      { label: 'Arithmetisches Mittel (Wikipedia)', href: 'https://de.wikipedia.org/wiki/Arithmetisches_Mittel', external: true },
    ],
  },
  {
    id: 'iqr',
    term: 'IQR (Interquartilsabstand)',
    aliases: ['IQR', 'Interquartilsabstand', 'Interquartilsbereich', 'Spannweite P25–P75'],
    category: 'Statistik',
    short:
      'Die Spannweite der mittleren 50 % aller Werte: IQR = P75 − P25. Ein enger IQR bedeutet ähnliche Scores in der Gruppe, ein breiter IQR deutet auf heterogene Qualität hin.',
    links: [
      { label: 'Methodik: IQR und Quartile', href: '/methodik' },
      { label: 'Interquartilsabstand (Wikipedia)', href: 'https://de.wikipedia.org/wiki/Interquartilsabstand', external: true },
    ],
  },
  {
    id: 'quartil',
    term: 'Quartil (P25 / P75)',
    aliases: ['Quartil', 'P25', '25. Perzentil', 'P10', 'P90'],
    category: 'Statistik',
    short:
      'Quartile teilen die sortierten Werte in vier gleich große Teile. P25 ist das untere Quartil (25 % liegen darunter), P75 das obere. P10 und P90 sind die entsprechenden Dezile.',
    links: [{ label: 'Quartil (Wikipedia)', href: 'https://de.wikipedia.org/wiki/Quartil', external: true }],
  },
  {
    id: 'deskriptive-statistik',
    term: 'Deskriptive Statistik',
    aliases: ['Deskriptive Statistik', 'beschreibende Statistik'],
    category: 'Statistik',
    short:
      'Beschreibt die gemessene Stichprobe (Lage, Streuung, Verteilung), ohne inferenzstatistische Schlüsse auf die Grundgesamtheit zu ziehen. Der HDRI berechnet bewusst keine p-Werte oder Konfidenzintervalle.',
    links: [
      { label: 'Methodik: Statistische Einordnung', href: '/methodik' },
      { label: 'Deskriptive Statistik (Wikipedia)', href: 'https://de.wikipedia.org/wiki/Deskriptive_Statistik', external: true },
    ],
  },
  {
    id: 'stichprobe',
    term: 'Stichprobe (N)',
    aliases: ['Stichprobe', 'N', 'Sample', 'Fallzahl'],
    category: 'Statistik',
    short:
      'Die Menge der in einem Quartal ausgewerteten Websites. N gibt die Fallzahl an. Veröffentlicht werden nur Aggregate, deren Fallzahl die k-Anonymität erfüllt.',
    links: [{ label: 'Stichprobe (Wikipedia)', href: 'https://de.wikipedia.org/wiki/Stichprobe', external: true }],
  },
  {
    id: 'konfidenz',
    term: 'Konfidenz (Scoring-Konfidenz)',
    aliases: ['Konfidenz', 'Confidence', 'Vertrauensniveau der Signale'],
    category: 'Index',
    short:
      'Maß für die Datenverfügbarkeit eines Signals: 1,0 = direkt beobachtet, 0,5 = imputiert (geschätzt), 0,0 = übersprungen. Achtung: Konfidenz misst Datenverfügbarkeit, nicht statistische Signifikanz — sie ist kein Konfidenzintervall.',
    links: [{ label: 'Methodik: Confidence-Skala', href: '/methodik' }],
  },
  {
    id: 'k-anonymitaet',
    term: 'k-Anonymität',
    aliases: ['k-Anonymität', 'k-Anonymitaet', 'k ≥ 5', 'k-anonym'],
    category: 'Datenschutz',
    short:
      'Schutzprinzip: Ein Aggregat wird nur veröffentlicht, wenn es mindestens k Fälle umfasst (hier k ≥ 5). Dadurch ist kein einzelner Betrieb aus den Kennzahlen rekonstruierbar. Bundesländer oder Gewerke mit zu wenigen Fällen werden nicht angezeigt.',
    links: [
      { label: 'Methodik: k-Anonymität', href: '/methodik' },
      { label: 'k-Anonymität (Wikipedia)', href: 'https://de.wikipedia.org/wiki/K-Anonymit%C3%A4t', external: true },
    ],
  },
  {
    id: 'suppression',
    term: 'Suppression (Delta-Unterdrückung)',
    aliases: ['Suppression', 'unterdrückt', 'Delta unterdrückt', 'Disclosure Control'],
    category: 'Datenschutz',
    short:
      'Gezieltes Verbergen eines Werts, wenn seine Veröffentlichung statistisch instabil oder datenschutzkritisch wäre — etwa bei zu kleiner Stichprobe oder zu kleiner Veränderung. Der Vergleich bleibt sichtbar, der Wert wird ausgeblendet.',
    long:
      'Gründe u. a.: delta_below_absolute_threshold, delta_below_relative_threshold, current/previous_sample_below_k, category_absent. Dies ist kein Fehler, sondern bewusster Schutz.',
    links: [
      { label: 'Methodik: Delta-Suppression', href: '/methodik' },
      { label: 'Statistical Disclosure Control (Wikipedia, EN)', href: 'https://en.wikipedia.org/wiki/Statistical_disclosure_control', external: true },
    ],
  },
  {
    id: 'delta',
    term: 'Delta',
    aliases: ['Delta', 'Veränderung', 'Differenz zum Vorquartal'],
    category: 'Index',
    short:
      'Die Veränderung einer Kennzahl gegenüber dem vorangegangenen veröffentlichten Quartal, in Indexpunkten. Zu kleine oder unsichere Deltas werden unterdrückt.',
    links: [{ label: 'Methodik: Warum fehlen manche Deltas?', href: '/methodik' }],
  },
  {
    id: 'reifestufe',
    term: 'Reifestufe',
    aliases: ['Reifestufe', 'Reifegrad', 'Maturity'],
    category: 'Index',
    short:
      'Klassen, in die Websites anhand ihres HDRI-Scores gruppiert werden (z. B. niedrig/mittel/hoch). Zeigt die Verteilung der digitalen Reife über die Stichprobe.',
    links: [{ label: 'Methodik: Scoring-Modell', href: '/methodik' }],
  },
  {
    id: 'canonical',
    term: 'Canonical (veröffentlichter Quartalsindex)',
    aliases: ['canonical', 'canonical veröffentlicht'],
    category: 'Index',
    short:
      'Pro Quartal gibt es genau einen verbindlichen, „canonical" veröffentlichten Index. Nur diese kanonischen Quartale werden für Verlauf und Vergleiche verwendet — nicht Rohdaten einzelner Pipeline-Läufe.',
    links: [{ label: 'Methodik: Warum schwanken die Quartale?', href: '/methodik' }],
  },
  {
    id: 'dimension',
    term: 'Dimension',
    aliases: ['Dimension', 'Dimensionen'],
    category: 'Index',
    short:
      'Eine der sechs thematischen Achsen des HDRI (Recht, Kontakt, Strukturierte Daten, Vertrauen, Soziale Präsenz, Barrierefreiheit). Jede Dimension hat ein deklariertes Gewicht; die Summe ergibt 1,0.',
    links: [
      { label: 'Methodik: Die sechs Dimensionen', href: '/methodik' },
      { label: 'Codebook: Dimensionen & Gewichtungen', href: '/codebook' },
    ],
  },
  {
    id: 'indikator',
    term: 'Indikator',
    aliases: ['Indikator', 'Indikatoren'],
    category: 'Index',
    short:
      'Eine einzelne, automatisch prüfbare Messgröße innerhalb einer Dimension. Jeder Indikator bildet ein Rohsignal über eine Scoring-Regel auf 0–100 ab.',
    links: [{ label: 'Codebook: Alle Scoring-Regeln', href: '/codebook' }],
  },
  {
    id: 'gewicht',
    term: 'Gewicht',
    aliases: ['Gewicht', 'Gewichtung', 'weight'],
    category: 'Index',
    short:
      'Anteil, mit dem eine Dimension oder ein Indikator in den übergeordneten Score eingeht. Der Gesamt-HDRI ist das gewichtete arithmetische Mittel der Dimensions-Scores.',
    links: [{ label: 'Codebook: Gewichtungen', href: '/codebook' }],
  },
  {
    id: 'handwerksordnung',
    term: 'Handwerksordnung (HWO)',
    aliases: ['Handwerksordnung', 'HWO', 'Anlage A', 'Anlage B'],
    category: 'Recht & Technik',
    short:
      'Deutsches Bundesgesetz, das die berufsständische Organisation des Handwerks regelt. Anlage A listet zulassungspflichtige Handwerke, Anlage B zulassungsfreie Handwerke. Die HDRI-Klassifizierung folgt dieser amtlichen Liste.',
    links: [
      { label: 'Anlage A (gesetze-im-internet.de)', href: 'https://www.gesetze-im-internet.de/hwo/anlage_a.html', external: true },
      { label: 'Anlage B (gesetze-im-internet.de)', href: 'https://www.gesetze-im-internet.de/hwo/anlage_b.html', external: true },
    ],
  },
  {
    id: 'gewerk',
    term: 'Gewerk',
    aliases: ['Gewerk', 'Handwerk', 'Gewerkegruppe', 'Destatis-Gruppe'],
    category: 'Index',
    short:
      'Ein Handwerk nach der amtlichen Klassifizierung der Handwerksordnung (HWO). Im Dashboard werden Gewerke in sieben Gruppen (I–VII) aggregiert, die dem Destatis-Schema entsprechen.',
    links: [
      { label: 'Methodik: Klassifizierung', href: '/methodik' },
      { label: 'Destatis — Handwerksstatistiken', href: 'https://www.destatis.de', external: true },
    ],
  },
  {
    id: 'schema-org',
    term: 'Schema.org / strukturierte Daten',
    aliases: ['Schema.org', 'strukturierte Daten', 'Strukturierte Informationen', 'JSON-LD'],
    category: 'Recht & Technik',
    short:
      'Standardisiertes Vokabular zur maschinenlesbaren Auszeichnung von Inhalten (z. B. Adresse, Öffnungszeiten). Stark korreliert mit Suchmaschinen-Verständlichkeit, aber kein SEO-Score.',
    links: [{ label: 'schema.org', href: 'https://schema.org/', external: true }],
  },
  {
    id: 'impressum',
    term: 'Impressum (§ 5 DDG)',
    aliases: ['Impressum', 'Pflichtangaben', 'TMG', 'DDG'],
    category: 'Recht & Technik',
    short:
      'Gesetzlich vorgeschriebene Anbieterkennzeichnung für geschäftsmäßige Websites in Deutschland. Die Pflicht ergibt sich seit 2024 aus § 5 Digitale-Dienste-Gesetz (DDG, zuvor § 5 TMG).',
    links: [
      { label: '§ 5 DDG (gesetze-im-internet.de)', href: 'https://www.gesetze-im-internet.de/ddg/__5.html', external: true },
    ],
  },
  {
    id: 'barrierefreiheit',
    term: 'Barrierefreiheit (WCAG / BFSG)',
    aliases: ['Barrierefreiheit', 'WCAG', 'BFSG', 'BITV', 'Accessibility'],
    category: 'Recht & Technik',
    short:
      'Zugänglichkeit von Websites für Menschen mit Behinderungen. Der HDRI prüft automatisiert WCAG-Konformität (via Axe-Core). Seit dem Barrierefreiheitsstärkungsgesetz (BFSG) ist Barrierefreiheit für viele Anbieter verpflichtend.',
    links: [
      { label: 'WCAG 2.1 (deutsche Übersetzung, W3C)', href: 'https://www.w3.org/Translations/WCAG21-de/', external: true },
      { label: 'axe-core (GitHub)', href: 'https://github.com/dequelabs/axe-core', external: true },
    ],
  },
];

/** Terms sorted alphabetically by `term` (German locale). */
export function sortedGlossary(): GlossaryEntry[] {
  return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'de'));
}

/** Fast lookup by id for the <Term/> component. */
export const glossaryById: Record<string, GlossaryEntry> = Object.fromEntries(
  GLOSSARY.map((entry) => [entry.id, entry]),
);

/** Initial letters (for the A–Z index on the glossary page). */
export function glossaryLetters(): string[] {
  return [...new Set(sortedGlossary().map((e) => e.term[0]!.toUpperCase()))];
}
