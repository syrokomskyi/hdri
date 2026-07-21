# Sie bestellen eine Website - und erhalten eine digitale Infrastruktur: ein ingenieurtechnischer Blick auf Webentwicklung

Wenn der Inhaber einer Handwerkswerkstatt oder eines lokalen Dienstleistungsbetriebs in Baden-Württemberg zu mir kommt und sagt: „Ich brauche eine Website", verstehe ich: Er beschreibt eine Kategorie, die ihm vertraut ist. Eine Web-Visitenkarte, eine Landingpage, ein Projekt mit einem Baukasten oder WordPress - etwas, das man Kunden zeigen kann und das bei Google auffindbar ist. Die Formulierung ist nachvollziehbar. Aber sie beschreibt nicht das, was ich tatsächlich baue.

Das Ergebnis meiner Arbeit lässt sich treffender nicht als Website, sondern als steuerbare digitale Infrastruktur bezeichnen. Das ist kein Wortspiel - es beschreibt, wodurch sich das Artefakt, das der Auftraggeber erhält, architektonisch und wirtschaftlich unterscheidet. Und wo die ehrlichen Grenzen dieses Modells liegen - denn es passt nicht für jeden.

Der Inhaber einer Tischlerei kauft weder Astro noch Ed25519-Signaturen. Er kauft weniger Risiko, planbare Kosten und einen klaren Ablauf, falls er sich entscheidet, den Anbieter zu wechseln. Technische Entscheidungen sind nur dann sinnvoll, wenn sie genau das erklären.

---

## Warum das weder WordPress noch ein Website-Baukasten ist

Der Auftraggeber erhält eine statisch generierte Website auf Basis von Astro und TypeScript, bereitgestellt auf Cloudflare. Kein dynamisches CMS mit Datenbank, das die Seite bei jeder Anfrage neu zusammensetzt. Keine Single-Page-App, deren Inhalte erst nach der Ausführung von JavaScript sichtbar werden. Es ist ein kompilierter Satz von Seiten, bei dem Interaktivität gezielt ergänzt wird - als „Inseln" und nicht als vollständige Abhängigkeit der gesamten Website vom Code im Browser.

Was bedeutet das für das Geschäft? Weniger Komplexität. Ein dynamisches CMS erfordert kontinuierliche Betreuung: Updates des Cores, der Plugins, Monitoring von Schwachstellen. Ich behaupte nicht, dass WordPress unsicher ist - bei fachgerechter Wartung funktioniert es über Jahre. Aber statische Generierung entfernt eine ganze Klasse von Runtime-Risiken, die mit serverseitiger Seitengenerierung, Datenbank und der Kette externer Plugins verbunden sind.

Die zweite Folge: Die Website selbst ist als schlanke kompositorische Hülle aufgebaut - die Geschäftslogik liegt nicht darin. Komponenten, Validatoren und Runtime sind in gemeinsame Pakete ausgelagert. Die Website besteht aus einem Manifest, Content-Dateien, einem Geschäftsprofil, Navigation, FAQ und generierten Hilfsdateien. Der Auftraggeber erhält keinen handgeschriebenen Code, den nach einem halben Jahr „niemand mehr versteht", sondern ein baubares und validierbares Artefakt: Aus derselben Beschreibung entsteht dieselbe Website. Reproduzierbarkeit ist keine Ästhetik. Sie ist ein Schutz vor der Situation, in der ein Unternehmen zum Geisel der Erinnerung eines bestimmten Entwicklers wird.

---

## Content als Daten, nicht als Chaos aus Korrekturen

Seiten werden deklarativ beschrieben - in Markdown und YAML, über ein Array von Blöcken, wobei jeder Block einen Typ und Param hat. Im Seiteninhalt gibt es kein beliebiges HTML oder JSX. Die Blöcke sind typisiert und werden anhand eines Schemas validiert.

Die Folge: Seiten werden nicht jedes Mal „neu gezeichnet", sondern aus prüfbaren Elementen zusammengesetzt. Weniger zufällige Defekte, weniger Abweichungen zwischen Bereichen.

Geschäftsdaten sind separat ausgelagert - Preise, rechtliche Angaben, Adressen, Kontaktpunkte. Sie werden nicht in Texten und Komponenten hart codiert, sondern an einer einzigen kanonischen Stelle gespeichert und per Referenz eingefügt. Auf den ersten Blick ist das ein Detail für Ingenieure. Tatsächlich ist es eine direkte Antwort auf ein Problem, das jedem Geschäftsinhaber vertraut ist: Der Preis ändert sich, das Büro zieht um - und zwanzig Seiten müssen manuell angepasst werden, wobei fünf vergessen werden. Hier erfolgt die Änderung in einer Datei und wird über die gesamte Website hinweg übernommen.

---

## Design, das durch seine Verbote wertvoll ist

Die visuelle Sprache wird über ein Designsystem definiert, das ich Biom nenne. Das Biom bestimmt Palette, Typografie, Abstände, Schatten, Motion, Effekte - über Tokens und CSS-Variablen. Hartcodierte Farben sind verboten.

Das Ungewohnte daran sind vermutlich die programmatischen Verbote innerhalb des Designsystems. Auf Build-Ebene lässt es nicht zu, bestimmte visuelle Klischees einzufügen - etwa Stockfotos mit Bauhelmen oder gesichtslose Handschläge - und blockiert einzelne Marketingformulierungen. Z.B. „billig" oder „Ergebnis garantiert".

Die meisten Plattformen verkaufen Freiheit: Buttons umfärben, Schriften ändern, Blöcke verschieben. Ich schlage das Gegenteil vor. Der Auftraggeber kauft nicht die Möglichkeit, das Design zu beschädigen, sondern Schutz vor einer zufälligen Verschlechterung der Kommunikation. Durch Conversion-Wachstum zu beweisen, dass Verbote besser funktionieren, kann ich nicht - solche Daten habe ich nicht, und sie zu versprechen wäre unehrlich. Aber die Managementlogik ist transparent: Kommunikationsqualität, die auf der programmatischen Unmöglichkeit beruht, Regeln zu verletzen, ist stabiler als Qualität, die von Disziplin und guter Laune abhängt.

Dasselbe gilt für die Abfolge der Blöcke auf der Startseite - eine entworfene Kette, die den skeptischen Besucher von seinem Problem zu einem verständlichen Angebot führt. Das ist eine technisch aufgebaute Erklärungsstruktur, keine zufällige Sammlung von Sektionen.

---

## Bereitschaft zur maschinellen Lesbarkeit ist keine zusätzliche Schicht

Suche wird zunehmend maschinell vermittelt: Ein Teil der Zielgruppe erhält Antworten über KI-Assistenten. Das ist ein erkennbarer Trend. Aber eine Website so zu konzipieren, dass sie nicht nur für Menschen, sondern auch für Maschinen verständlich ist, ist schon heute sinnvoll.

Deshalb ist die semantische Ebene direkt in den Aufbau integriert. Jede Seite erhält einen Graphen strukturierter Daten im JSON-LD-Format - mit Entitäten wie Organization, WebSite, BreadcrumbList, Service, Person, FAQPage, je nach Seitentyp. Zusätzlich werden maschinenlesbare Textindizes `llms.txt` und `llms-full.txt` sowie ein strukturiertes Discovery-Dokument `.well-known/agent.json` für agentische Szenarien generiert. Die Datei `robots.txt` steuert den Zugriff von Crawlern.

Das erhöht die Maschinenlesbarkeit, garantiert aber weder die Aufnahme in KI-Antworten noch Zitierungen oder Positionen in den Suchergebnissen. `llms.txt` und ähnliche Formate sind derzeit keine offiziellen Webstandards. Ich baue die Website so, dass sie für Maschinen verständlich ist. Das ist Vorbereitung, kein Versprechen von Sichtbarkeit.

Wichtig ist, diese Ebene nicht mit Programmatic SEO (unten) zu verwechseln: Die eine beantwortet die Frage, ob eine Maschine eine bereits bestehende Seite versteht; das andere, wie viele relevante Seiten überhaupt entstehen.

---

## Programmatisch erstellte Seiten nur mit belastbarer Belegbasis

Für ein lokales Unternehmen ist es wichtig, bei engen Suchanfragen präsent zu sein - etwa „Fassade streichen in Backnang". Ein Ansatz ist die programmatische Generierung von Landingpages entlang einer Geo-Kaskade: Branche, Land, Region, Stadt, Nachfrage. Das Problem ist bekannt: Die massenhafte Generierung tausender Seiten niedriger Qualität (Thin Content) schadet der Website.

Deshalb durchläuft bei mir jede programmatisch erstellte Seite fünf Gates, bevor sie indexierbar wird:

1/ gibt es reale Suchnachfrage
2/ gibt es faktische Nachweise für ausgeführte Arbeiten in dieser Region
3/ gibt es ausreichend substanzhaltiges, einzigartiges Material
4/ ist die Seite nicht veraltet
5/ passt sie in das Budget des Tarifs

Der Sinn besteht nicht darin, „Seiten zu generieren", sondern sagen zu können: Diese Seite darf vorerst nicht indexiert werden.

Meine Gates sind derzeit konfigurierbare Zulassungsregeln, keine nachweislich universelle Methodik. Sie reduzieren das Risiko schwacher Seiten, garantieren aber weder Indexierung noch das Ausbleiben von Sanktionen durch Suchmaschinen (Google bewertet Qualität nach eigenen, nicht öffentlichen Kriterien).

---

## Was im Preis enthalten ist und warum er planbar ist

Der Kunde zahlt 70 € pro Monat (oder 700 € pro Jahr) plus 200 € für die Einrichtung. Das ist nicht der niedrigste Preis auf dem Webentwicklungsmarkt. Enthalten ist aber kein abstraktes „Hosting", sondern ein konkretes Paket:

- Deployment auf Cloudflare Workers.
- Build und Validierung bei jeder Änderung.
- Pflege des Designsystems und seiner Einschränkungen.
- Aktualität der semantischen Ebene.
- Quality Gates für programmatische Seiten.
- der gesamte Prozess, Änderungen durch einen gesteuerten Lebenszyklus zu führen - von der Materialisierung der Anpassung bis zum Release

Die wirtschaftliche Planbarkeit besteht hier nicht darin, dass die Kosten niedriger wären als bei einer WordPress-Website auf billigem Hosting oder bei einem Baukastensystem für ein paar Euro im Monat - rein numerisch kann es auch teurer sein. Die Planbarkeit liegt an anderer Stelle: Es gibt keine versteckten Kostenpositionen, die normalerweise später auftauchen: die Notfallbehebung eines kompromittierten Plugins, ein vollständiger Neuaufbau beim Wechsel des Entwicklers, ein „Neuschreiben von Grund auf" wegen undokumentiertem Custom Code. Vergleichende Studien zu den Total Cost of Ownership verschiedener Webentwicklungsmodelle habe ich derzeit nicht, deshalb verspreche ich nicht, dass mein Modell kurzfristig oder langfristig günstiger ist - aber ich verspreche, dass die Kostenstruktur von Anfang an sichtbar ist und sich nicht mit dem Wachstum der Website verändert.

Eine separate Frage ist, wer Inhalte bearbeitet. Die Bearbeitung erfolgt über strukturierte Dateien und einen gesteuerten Prozess. Typische Änderungen - Text, Preise, Foto, eine neue programmatische Seite - nehme ich selbst als Teil der Betreuung vor, im Rahmen des Tarifs oder als separat abgestimmte Aufgabe. Das ist kein Modell nach dem Prinzip: „Der Kunde verschiebt jeden Tag selbst Blöcke mit der Maus." Wenn ein Unternehmen genau diese Freiheit braucht, ist es ehrlicher, das direkt zu sagen (siehe Abschnitt zu den Einschränkungen).

---

## Compliance: ein architektonisches Prinzip, keine rechtliche Garantie

Für Unternehmen in Deutschland und der DACH-Region sind Fragen rund um DSGVO und Barrierefreiheit (BFSG) Teil des operativen Risikos. Ein Teil der Antworten liegt auf architektonischer Ebene. Die Grenze muss aber klar benannt werden: Was Architektur leistet, ersetzt keine juristische Prüfung und keine manuelle Prüfung der Barrierefreiheit.

Die Infrastruktur ist auf die EU ausgerichtet: Hosting und Datenverarbeitung sind mit diesem Fokus konzipiert. Das reduziert einen Teil der Fragen zur Datenübermittlung, ersetzt aber nicht die Prüfung konkreter Integrationen - Formulare, E-Mail, CRM, Analytics -, die der Auftraggeber zusätzlich zur Website einbindet. Jeder dieser Dienste hat seine eigene Jurisdiktion, und das muss separat geprüft werden.

Designsystem und Validierung unterstützen Barrierefreiheit indirekt: programmatische Einschränkungen machen typische Verstöße bei Kontrast, Überschriftenstruktur und Layout, die bei Audits nach WCAG oder EN 301 549 häufig auffallen, unwahrscheinlicher. Ein formales manuelles Audit der Barrierefreiheit führe ich standardmäßig jedoch nicht durch, und architektonische Disziplin ist kein BFSG-Konformitätszertifikat. Wenn Barrierefreiheit rechtlich kritisch ist, muss das Audit eine separate, ausdrücklich beauftragte Aufgabe sein.

Architektur reduziert einen Teil der technischen Risiken im Zusammenhang mit DSGVO und Barrierefreiheit, ersetzt aber keine Rechtsberatung und kein spezialisiertes Audit. Ich konzipiere mit Blick auf diese Anforderungen, garantiere jedoch nicht deren Erfüllung.

---

## Gesteuerte Änderungen statt Live-Korrekturen

Änderungen an der Website durchlaufen einen gesteuerten Lebenszyklus: Materialisierung, Migration, Korrekturen, Validierung, Release-Vorbereitung, Abgleich, Abschluss. Direkte Änderungen an der „Live"-Website werden erkannt und blockiert. Jede Änderung hinterlässt eine Spur in der Historie - es ist nachvollziehbar, wer wann was geändert hat. Das sind Änderungen ohne Chaos, kein Bearbeiten auf gut Glück.

---

## Ausstieg ohne Illusionen und überprüfbare Echtheit

„Die Website gehört dem Kunden" sagen fast alle. Beweisen können es nur wenige. Wenn der Auftraggeber sich entscheidet zu gehen, geht es nicht um eine Erklärung, sondern darum, ob die Infrastruktur vollständig mitgenommen, ihre Echtheit überprüft und sichergestellt werden kann, dass genau das erhalten wurde, was zu Beginn vereinbart war.

---

## Prüfen Sie: Brauchen Sie einfach nur eine Website oder eine steuerbare digitale Infrastruktur?

Beantworten Sie einige Fragen zu Ihrer aktuellen Website, zu Änderungen, Daten, Integrationen und Anforderungen an die Sichtbarkeit. Am Ende erhalten Sie ein ehrliches Risikoprofil: wo ein ingenieurorientiertes Modell helfen kann und wo es besser ist, Einschränkungen vorab zu prüfen.

**Nächster Schritt:** 3-minütigen Selbst-Audit durchführen
