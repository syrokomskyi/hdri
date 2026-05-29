# HDRI-Methodologie

> [English Version](METHODOLOGY.en.md)

Diese Datei beschreibt die wissenschaftliche und technische Methodik des **Handwerk Digital Readiness Index (HDRI)**. Sie richtet sich an Forscher, politische Analysten und Prüfer, die verstehen müssen, wie der Index konstruiert ist, bevor sie ihn für Studien oder Berichte verwenden.

Die implementierte Methodik ist vollständig in [`codebook.yaml`](apps/digital-observatory/.input/codebook.yaml) (Bewertungsregeln) und [`ontology.yaml`](apps/digital-observatory/.input/ontology.yaml) (Signalkatalog) kodiert. Dieses Dokument stellt die menschenlesbare Zusammenfassung dar.

---

## 1. Was ist „digitale Bereitschaft" im HDRI-Kontext?

Unter **digitaler Bereitschaft** verstehen wir die Fähigkeit eines Handwerksunternehmens, seinen Online-Auftritt so zu gestalten, dass er rechtlich konform, kontaktierbar, strukturiert auffindbar, vertrauenswürdig und barrierefrei ist. Der HDRI misst keine internen IT-Prozesse (ERP, CAD, Buchhaltungssoftware), sondern ausschließlich die öffentlich sichtbare digitale Präsenz.

Die Dimensionen des Index basieren auf:
- **EU-Digital Economy and Society Index (DESI)** — allgemeine Benchmarks für digitale Infrastruktur
- **Google Page Experience** — technische Leistungs- und Barrierefreiheitsstandards
- **Deutsches und EU-Recht** — §5 TMG, Art. 13/14 DSGVO, Barrierefreiheitsstärkungsgesetz (BFSG)

---

## 2. Autoritative Quellen

Die Klassifizierung der Handwerksbetriebe folgt ausschließlich dem offiziellen Recht:

- **Anlage A und Anlage B der Handwerksordnung (HWO)** — die gesetzlichen Listen der zulassungspflichtigen und zulassungsfreien Handwerke in Deutschland. Quelle: [`Gesetze im Internet`](https://www.gesetze-im-internet.de/hwo/anlage_a.html) und [`Anlage B`](https://www.gesetze-im-internet.de/hwo/anlage_b.html). Diese Daten sind als maschinenlesbare JSON-Dateien in [`packages/business-core/src/gewerk/data/hwo-master.json`](packages/business-core/src/gewerk/data/hwo-master.json) versioniert.

- **Destatis-Gewerbegruppen I–VII** — das Statistische Bundesamt (Destatis) ordnet die HWO-Handwerke in sieben Gewerbegruppen ein. Die Zuordnung ist in [`packages/business-core/src/gewerk/data/destatis-mapping.json`](packages/business-core/src/gewerk/data/destatis-mapping.json) dokumentiert und beruht auf der Publikation *„Gewerbegruppen der Handwerksstatistiken nach Handwerksordnung Stand 2021"*.

Durch diese Verankerung an Bundesrecht und offizieller Statistik ist die Klassifizierung reproduzierbar und für Forschungseinrichtungen (ZEW, Fraunhofer IAO, Universitäten) nachvollziehbar.

---

## 3. Signale und Ontologie

Ein **Signal** ist eine beobachtbare Eigenschaft einer Website, die von einem automatisierten Extraktor (Crawler, DOM-Analysator, Lighthouse, axe) erfasst wird. Die vollständige Liste aller Signale lebt in [`ontology.yaml`](apps/digital-observatory/.input/ontology.yaml).

| Signal-Kategorie | Beispiele | Quelle |
|---|---|---|
| `legal.*` | Impressum, Datenschutzerklärung, AGB, BFSG-Erklärung | Homepage-Crawl + Regel-Matching (§5 TMG, Art. 13/14 DSGVO, BFSG) |
| `contact.*` | Telefon, E-Mail, Kontaktformular, Öffnungszeiten | DOM-Extraktion (schema.org, Microdata) |
| `structured_data.*` | schema.org-Typen (LocalBusiness, Service, FAQ) | JSON-LD / Microdata Parser |
| `trust.*` | Zertifizierungen, Auszeichnungen, Mitgliedschaften | DOM-Extraktion |
| `social.*` | Xing, Pinterest, Twitter, Facebook | DOM-Extraktion |
| `accessibility.*` | axe-Verletzungen, Lighthouse-Barrierefreiheits-Score | axe-core, Lighthouse |
| `content.*` | Portfolio, Team-Seite, Referenzen | DOM-Extraktion |
| `privacy.consent.*` | Cookie-Banner-Qualität | DOM-CSS-Analyse |

Jedes Signal hat:
- `value_type` (`bool`, `str`, `int`, `float`)
- `stability` (`high` / `medium` / `low`) — wie zuverlässig der Extraktor ist
- `extractor` — Versionsnummer des verwendeten Extraktors (z. B. `rule_v3`, `dom_css_v2`)
- `notes` — Rechtsgrundlage oder Einschränkung

---

## 4. Index-Konstruktion

### 4.1 Dimensionen und Gewichte

Der HDRI ist ein **gewichtetes arithmetisches Mittel** über 6 Dimensionen. Jedes `indicator`-Gewicht multipliziert sich mit dem zugehörigen `dimension`-Gewicht.

| Dimension | Gewicht | Begründung |
|---|---|---|
| **Rechtskonformität** (`legal_compliance`) | 28 % | Höchstes Risiko bei Abwesenheit (§5 TMG, DSGVO, BFSG). |
| **Kontaktierbarkeit** (`contact`) | 22 % | Direkte Konversionsebene für Kunden. |
| **Strukturierte Daten** (`structured_data`) | 18 % | Sichtbarkeit in Suchmaschinen und KI-gestützten Antwortsystemen. |
| **Barrierefreiheit** (`accessibility`) | 16 % | BFSG-Pflicht ab 28.06.2025 für E-Commerce; soziale Inklusion. |
| **Vertrauenssignale** (`trust`) | 12 % | Qualitätsindikatoren, die Kaufentscheidungen beeinflussen. |
| **Soziale Medien** (`social`) | 4 % | Reichweite, aber nur ergänzender Faktor für reine Handwerksbetriebe. |

Die implementierten Regeln finden sich in [`codebook.yaml`](apps/digital-observatory/.input/codebook.yaml) unter `dimensions`.

### 4.2 Skalierung

Jeder Indikator wird auf eine **0–100-Skala** abgebildet:
- `bool`-Regeln: `true → 100`, `false → 0`
- `numeric`-Regeln: linear zwischen `minScore` und `maxScore`
- `inverse_count`-Regeln: je weniger Verletzungen (axe), desto höher der Score

### 4.3 Umgang mit fehlenden Werten

Nicht alle Websites liefern alle Signale. Das Codebook definiert **bedingte Missing-States**:

| State | Bedeutung | Auswirkung auf Score |
|---|---|---|
| `absent` | Signal existiert nicht auf der Seite | `zero` → 0 Punkte |
| `unreachable` | Seite war nicht erreichbar (Timeout, 5xx) | `exclude` → wird aus der Mittelung entfernt |
| `forbidden` | Zugriff blockiert (403, Bot-Detection) | `exclude` → wird aus der Mittelung entfernt |

Das verhindert, dass tote oder blockierte Seiten den Durchschnitt künstlich senken.

### 4.4 Aggregation auf Domain-Ebene

Falls eine Domain mehrere gecrawlte Seiten hat (z. B. Startseite + Impressum), wird der **Maximum-Operator** über alle Seiten angewendet: wenn das Impressum auf *irgendeiner* gecrawlten Seite vorhanden ist, gilt die Domain als positiv.

### 4.5 Stratifizierte Stichprobenziehung

Die Berichterstattung erfolgt nicht nur im Gesamtdurchschnitt, sondern nach **Schichten** `(gewerk_group × bundesland)`. Innerhalb jeder Schicht wird eine deterministische Zufallsziehung mit Seeded-RNG (FNV-1a → mulberry32) durchgeführt. Dadurch sind wiederholte Läufe reproduzierbar.

Details zur Sampling-Implementierung: [`apps/hdri-factory/AGENTS.md`](apps/hdri-factory/AGENTS.md).

---

## 5. Datenschutz und K-Anonymität

Bevor Ergebnisse veröffentlicht werden, wird eine **K-Anonymitätsprüfung** durchgeführt:
- `k_min = 5` — jede Schicht muss mindestens 5 Domains enthalten
- Standardmodus: `enforce` (Pipeline bricht ab, wenn eine Schicht zu klein ist)
- Nur für Entwicklung auf `warn` umstellbar

Identifizierende Daten (Domain, Gewerk, Bundesland, echte `site_id`) werden im Modus `public` entfernt. Im Modus `internal` bleiben sie für interne Analysen erhalten.

---

## 6. Datenqualität und Limitationen

### 6.1 Liveness Bias

Nur erreichbare (`is_live=true`) Seiten werden gecrawlt und bewertet. Seiten, die bei der Erreichbarkeitsprüfung fehlschlagen, erscheinen in keiner Auswertung. Das bedeutet: **der Index unterschätzt die digitale Bereitschaft der am wenigsten digitalisierten Betriebe**, da diese oft gar keine Website haben.

### 6.2 Extractor-Konfidenz

Jeder Extraktor hat eine Versionsnummer (`rule_v3`, `dom_css_v2`). Bei Regel-Upgrades werden historische Daten nicht rückwirkend neu berechnet; das führt zu inkrementellen Verbesserungen über die Zeit. Die Versionierung ermöglicht es Forschern, die Genauigkeit jeder Messung nachzuvollziehen.

### 6.3 Zeitraum und Periodizität

Der Index wird **quartalsweise** berechnet. Die Periodenbezeichnung folgt dem Muster `YYYY-Qn` (z. B. `2026-Q2`). Alle SQLite-Datenbanken tragen das Jahr als Suffix (`core_2026.db`, `pages_2026.db`).

---

## 7. Veröffentlichung und Nachnutzung

Die aggregierten, anonymisierten Quartalsdaten werden auf **[handwerk-index.de](https://handwerk-index.de)** veröffentlicht. Die Website ist ein statisches Astro-Dashboard, das aus [`apps/hdri-dashboard`](apps/hdri-dashboard) gebaut wird. Der Quellcode des Dashboards ist unter [Apache License 2.0](LICENSE) verfügbar.

---

## 8. Versionierung und Reproduzierbarkeit

- **Codebook** — Versioniert in `codebook.yaml` (aktuell v1.3.0). Eine Änderung der Gewichte oder Regeln erfordert eine neue Codebook-Version.
- **Ontologie** — Versioniert in `ontology.yaml` (aktuell v1.0.0). Neue Signale erhalten ein `introduced_in`-Datum.
- **Datenbanken** — Jedes Quartal erzeugt neue `*_YYYY.db`-Dateien; historische Daten werden nicht überschrieben.
- **Reproduzierbarkeit** — Durch deterministische Asset-ID-Ableitung (SHA-256 über Domain + `sourceToken`) und Seeded-Sampling können identische Stichproben bei erneuten Läufen erzeugt werden.

---

## 9. Akademische Referenzen

| Quelle | Bezug zum HDRI |
|---|---|
| [EU Digital Economy and Society Index (DESI)](https://digital-strategy.ec.europa.eu/en/policies/desi) | Benchmark für digitale Infrastruktur und öffentliche Dienstleistungen |
| [OECD Digital Government Index](https://www.oecd.org/gov/digital-government-index.htm) | Rahmen für die Bewertung digitaler Reife von Organisationen |
| [Google Page Experience](https://developers.google.com/search/docs/appearance/page-experience) | Technische Leistungsmetriken (Largest Contentful Paint, CLS) |
| §5 TMG (Telemediengesetz) | Rechtsgrundlage für Impressumspflicht |
| Art. 13/14 DSGVO | Rechtsgrundlage für Datenschutzerklärung |
| Barrierefreiheitsstärkungsgesetz (BFSG) | Rechtsgrundlage für Barrierefreiheits-Erklärung (ab 28.06.2025) |
| [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) und [EN 301 549](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/) | Technische Standards für Web-Barrierefreiheit |
| [Destatis — Gewerbegruppen der Handwerksstatistiken](https://www.destatis.de) | Offizielle Klassifizierung der Handwerke in Gruppen I–VII |
| [Handwerksordnung (HWO) — Anlage A/B](https://www.gesetze-im-internet.de/hwo/) | Rechtliche Grundlage der Gewerkeklassifizierung |

---

> Diese Methodologie wird mit jeder Codebook-Version aktualisiert. Die letzte Änderung entspricht **Codebook v1.3.0** / **Ontologie v1.0.0**.
