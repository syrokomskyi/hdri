# Changelog

All notable client-facing changes to the `hdri` project are documented here.
## Plattform-Updates 2026-08-06 — 2026-08-12

In dieser Woche wurden mehrere Verbesserungen und neue Funktionen zur flexibleren Steuerung von CI-Builds sowie zur Unterstützung weiterer Bereitstellungsoptionen eingeführt. Zudem wurde die Konfiguration für Multi-Package-Projekte und Workspace-spezifische CI-Prozesse erweitert, was eine bessere Anpassung an verschiedene Organisationsstrukturen ermöglicht. Diese Änderungen steigern die Effizienz technischer Abläufe und bieten mehr Kontrolle für komplexe Anwendungsszenarien.

### Added
- Unterstützung für das Überspringen des Build-Schrittes in bestimmten CI-Jobs. Damit wird eine flexiblere Arbeitsweise in kontinuierlichen Integrationsprozessen ermöglicht, was Zeit spart und Ressourcen schont.
- Neues Feature zur gezielten Auswahl von Workspaces für CI-Builds ("Workspace-Filter"). Dies erlaubt es, nur relevante Komponenten zu testen oder bereitzustellen und optimiert so insbesondere große Projekte für schnellere Abläufe.
- Cloudflare Pages-Bereitstellung wird jetzt unterstützt. Dies bietet neue Möglichkeiten für das Hosting und die Bereitstellung von Webprojekten, insbesondere mit Hinblick auf europäische Datenschutzbestimmungen (EU-weite Hosting-Optionen).
- Mehrpaketmanager-Unterstützung hinzugefügt (EU-weit). Das erleichtert die Integration von Projekten, die unterschiedliche Paketverwaltungssysteme verwenden.

### Improved
- Alle Konfigurationsdateien wurden aktualisiert und enthalten jetzt organisationsspezifische Werte für eine klarere, anpassbare Projektstruktur.
- Prozesse zum Bauen und Deployen wurden optimiert: Der Build-Befehl verwendet jetzt gezielt Workspace-Filter und kann optional den Export von Daten überspringen. Dies sorgt für eine schlankere und schnellere Bereitstellung besonders im Zusammenspiel mit Astro und modernen Toolchains.

### Fixed
- Diverse Korrekturen und Vereinfachungen am CI- und Bereitstellungsprozess, einschließlich der Anpassung eingesetzter Befehle für stabileres und zuverlässigeres Deployment.

### Security & Compliance
- Destruktive Übertragungen von Git-Historien beim Deployment wurden entfernt, um Transparenz und Protokollintegrität zu gewährleisten (EU-weite Compliance).

### Integrations
- Cloudflare Pages-Integration für eine weitere Hosting-Plattform, die sowohl europäische Anforderungen an Datenschutz als auch internationale Skalierbarkeit unterstützt.

## Plattform-Updates für die Woche 2026-07-30 — 2026-08-05

Diese Woche lag der Schwerpunkt auf der Verbesserung der Wartbarkeit und der Nachvollziehbarkeit durch ausführliche Änderungsprotokolle und Dokumentations-Updates. Zusätzlich wurden mehrere Stabilitäts- und Sicherheitsanpassungen vorgenommen, um die Einhaltung von Compliance-Anforderungen zu gewährleisten. Für Nutzer in Europa stehen somit mehr Transparenz und ein sichereres Nutzungserlebnis zur Verfügung.

### Added
- Automatisch generierte und verlinkte Änderungsprotokolle (Changelogs) für alle Anwendungen und Pakete sorgen für mehr Transparenz bei Systemänderungen (EU-weite Relevanz).

### Improved
- Mehrere Software-Abhängigkeiten wurden aktualisiert, um Sicherheitslücken zu schließen und die Kompatibilität mit aktuellen Entwicklungsstandards sicherzustellen (EU-weite Relevanz).

### Fixed
- Beseitigung von Risiken durch versehentlich enthaltene Zugangsdaten in Testdateien; diese wurden entfernt, um Datensicherheit und Compliance zu gewährleisten (EU-weit).
- Fehlerbehebung bei der Projektkonfiguration, sodass Testdateien nun korrekt ausgeschlossen werden; dies trägt zu einer zuverlässigeren Build- und Testumgebung bei.

### Security & Compliance
- Entfernung versehentlich enthaltener Zugangsdaten (AWS STS Credentials) aus dem Quellcode, um Datenschutz und die Einhaltung gesetzlicher Vorgaben (z. B. DSGVO) zu stärken (EU-weite Relevanz).

### Integrations
- Umbenennung und Aktualisierung von Paket-Integrationen bei Drittanbietern, sodass der aktuelle europäische Anbieter '@warpgogol/changelog-live' verwendet wird, was den Support verbessert und rechtliche Sicherheit herstellt (EU-weit).

## Plattform-Updates für die Woche 2026-07-23 — 2026-07-29

In dieser Woche wurden vor allem technische Wartungsarbeiten durchgeführt, darunter ein Upgrade der Abhängigkeiten, das Entfernen von veralteten Entwicklungstools und das Beheben von Installationswarnungen. Diese Maßnahmen erhöhen die Sicherheit und Kompatibilität der Plattform und sorgen für einen reibungsloseren Betrieb. Für Kunden zeigen sich diese Verbesserungen insbesondere durch eine erhöhte Zuverlässigkeit und bessere Langzeitwartbarkeit.

### Added
- Eine zentrale README wurde hinzugefügt, um die Orientierung und Dokumentation für Nutzer und Administratoren der Plattform zu erleichtern.

### Improved
- Systemweite Aktualisierung der Software-Abhängigkeiten, um aktuelle Sicherheitsupdates und Verbesserungen zu übernehmen. Dies erhöht die Gesamtsicherheit und sorgt für bessere Kompatibilität mit neuen Browsern und Geräten (EU-weit).
- Alle Installationswarnungen im Zusammenhang mit Paketverwaltung wurden entfernt. Dadurch wird die Wartung für Kundenteams vereinfacht und das Risiko von Fehlerquellen reduziert (EU-weit).

### Fixed
- Fehlende Konfigurationsdateien für mehrere Plattform-Komponenten wurden wiederhergestellt, so dass die Entwicklung und der Betrieb wieder uneingeschränkt möglich ist.
- Versionsunterschiede bei Testwerkzeugen wurden behoben, was eine konsistentere Qualitätssicherung in allen Modulen ermöglicht.

### Security & Compliance
- Veraltete Entwicklungspakete und -skripte (z.B. code-compass) wurden entfernt. Das reduziert potenzielle Angriffsflächen, vereinfacht Prüfprozesse und trägt zu einem DSGVO-konformen Betrieb bei (EU-weit).

### Integrations
- Überflüssige oder veraltete Integrationen wurden bereinigt, sodass die Systemstruktur übersichtlicher und Fehlermöglichkeiten reduziert sind.

## Plattform-Updates für die Woche 2026-07-09 — 2026-07-15

In dieser Woche haben wir zahlreiche Verbesserungen an der Nutzeroberfläche des Dashboards vorgenommen, insbesondere im Design, der Lesbarkeit und beim Datenschutz. Zudem wurden neue Funktionen hinzugefügt, um die Bedienbarkeit und Informationstransparenz zu erhöhen. Außerdem profitieren Sie von weiteren Anpassungen an Datenschutzbanner, Tracking-Einstellungen und verbesserten Datenexporten.

### Added
- Animierte Hintergrundeffekte mit Bausteinen sorgen für ein modernes und ansprechendes Erscheinungsbild des Dashboards (DE).
- Konfigurierbarer Kontrast und Boost-Parameter für die animierten Bausteine zur besseren Darstellung je nach Nutzerpräferenz (DE).
- Animierte Chevron-Indikatoren bei aufklappbaren Bereichen zur intuitiveren Bedienung (DE).
- Link zum Changelog mit aktueller Änderungsanzahl im Dashboard-Footer, damit Sie Veränderungen direkt nachvollziehen können (EU-weit).

### Improved
- Vereinheitlichung und Modernisierung des Designs: Einführung von IBM Plex als neue Schriftfamilie, vereinfachtes Farbschema, reduzierte Schattierungen, Entfernung von Glas-Effekten und konsequenter Einsatz asymmetrischer Ecken für ein klareres UI (DE).
- Optimierte Bedienung und Lesbarkeit: Klare Hierarchie bei Überschriften, überarbeitete Term-Info-Buttons, verbesserte Hervorhebung von Links im Footer, neue Unterstreichungen für Barrierefreiheit sowie angepasste Farben bei Reifegradanzeigen und Metakarten (DE).
- Interaktive, einfach sortierbare Tabellen durch Integration von modernen Tabellenfunktionen, inklusive klarer Kennzeichnung externer Links (DE).
- Überarbeitung und Zentralisierung der Metadaten für mehr Übersichtlichkeit in FAQ und Glossar, inklusive verbesserter Terminologie und einheitlicher Darstellungen (DE).
- Neues Glossar-Einträge und Ergänzungen in der FAQ: Mehr Informationen zu Begriffen und Methoden, um mehr Transparenz beim Datenverständnis zu schaffen (DE).

### Fixed
- Mehrere kleinere Korrekturen bei Schreibweisen, Sprache, Legal References und Terminologie in der gesamten Oberfläche und in den Dokumentationen (DE).
- Verbesserte Funktion von sortierbaren Tabellen – keine unbeabsichtigte Sortierung beim Klick auf Info-Buttons (DE).
- Korrekte Anzeige der Changelog-Einträge im Footer auch bei Exporten aus verschiedenen Pfaden (EU-weit).

### Security & Compliance
- Privacy-First-Tracking: Matomo-Analytics wurde mit Einstellungen wie deaktivierter Browser Feature-Erkennung, aktualisierter Datenschutzerklärung und Opt-Out-Funktion ausgestattet – konform mit DSGVO/DSGVO und ohne Drittanbieter-Cookies (DE).

### Integrations
- Integration von Matomo Analytics für datenschutzkonformes Tracking ohne Cookies (DE).
- Einbindung von @tanstack/table-core für moderne, barrierefreie Tabellenfunktionen (DE).

## Plattform-Updates für die Woche 2026-07-02 — 2026-07-08

In dieser Woche wurde insbesondere das System rund um das bisherige 'GRACE'-Framework aktualisiert und einheitlich in 'COMPASS' umbenannt. Dies trägt zur besseren Verständlichkeit und Wartbarkeit bei, auch in Hinblick auf externe Kommunikation mit Kunden. Zudem wurden interne Strukturierungen vorgenommen, die mittelfristig die Stabilität und Weiterentwicklung unterstützen.

### Added
- Markierungen für Vertragsmodule und Änderungszusammenfassungen wurden in mehreren Konfigurations- und Quellcodedateien ergänzt. Dies schafft Klarheit über die Komponentenstruktur und vereinfacht spätere Anpassungen und Überprüfungen. (EU-weite Relevanz)

### Improved
- Alle Bestandteile des Systems, die bislang unter dem Namen 'GRACE' geführt wurden, wurden konsequent in 'COMPASS' umbenannt. Dies sorgt für eine konsistente Benennung, erleichtert das Verständnis und verhindert Missverständnisse bei Support und Dokumentation. Bestehende Funktionalitäten und Abläufe bleiben unverändert nutzbar. (EU-weite Relevanz)
- Struktur und Organisation zentraler Funktionsbereiche im System wurden verbessert, indem ehemals zusammengefasste Logik in übersichtlichere Module ausgelagert wurde. Dies erhöht die Wartbarkeit und beschleunigt zukünftige Weiterentwicklungen.

### Fixed
- Kleinere Korrekturen an Markierungen und Funktionsbestandteilen sichern die zuverlässige Ausführung auch nach der Umbenennung und Modularisierung.

### Security & Compliance
- Klare Abgrenzung und Kennzeichnung modularer Verträge im System unterstützen die Einhaltung von Dokumentations- und Nachweispflichten, z. B. bei Auftragsdatenverarbeitung oder regulatorischen Prüfungen (EU-DSGVO).

### Integrations
- Modulare Umbenennungen wurden auch in allen Schnittstellen und Abhängigkeiten übernommen, um durchgängige Kompatibilität zu gewährleisten.

## Plattform-Updates für die Woche 2026-06-25 — 2026-07-01

Diese Woche wurde die Qualitätssicherung in den Bereichen Datenintegrität, Nachvollziehbarkeit und Datenschutz weiter ausgebaut. Für Nutzer:innen wurden zusätzliche Informationskanäle geschaffen und die Zuverlässigkeit sowie Sicherheit der Plattform weiter erhöht. Die Aktualisierungen unterstützen speziell langfristige Datenhaltbarkeit und europäische Anforderungen an Stabilität und Transparenz.

### Added
- Neue Funktion zum Erfassen und Veröffentlichen des Methodik-Änderungsverlaufs auf der Methodik-Seite für vollständige Transparenz (EU-weit).
- Methodik-Änderungen sowie per-Periode eingefrorene Methodik-Snapshots, die eine zuverlässige Rückverfolgbarkeit jedes Analysezeitraums ermöglichen (EU-weit).
- Business Lifecycle Events werden jetzt erfasst, um alle relevanten Geschäftsereignisse nachzuvollziehen (EU-weit).
- Vault-Shard-Manifest und geplante regelmäßige Überprüfung wurden implementiert, um Datenbestände lückenlos und nachprüfbar zu dokumentieren und zu sichern (EU-weit).
- Population-Frame-Validator und editierbare Beispiel-Vorlage verfügbar, um Vorbereitung für Poststratifizierung und damit robustere Analysen zu vereinfachen (DE, EU-weit).
- Opt-in Funktion zur Impressum-Kontakt-Extraktion für strukturierte Auswertung verfügbar, im Sinne der DSGVO separat von anderen Prozessen verwaltbar (DE).
- Staging-Umgebung und validierte Freigabeprozesse vor Veröffentlichung, um Fehler vorher abzufangen und die Datenqualität weiter zu erhöhen (EU-weit).
- Neues Tool zur Erstellung von dauerhaft prüfbaren Quartalssnapshots für maximale Datenhaltbarkeit und Nachvollziehbarkeit (EU-weit).
- Automatische Offsite-Replikation von Vaults und geplante Datenüberprüfung erhöhen den Schutz gegen Datenverlust deutlich (EU-weit).
- Hot/Cold-Tiering für obs_json-Daten eingeführt, damit häufig genutzte Daten schneller bereitstehen, während ältere, weniger genutzte Daten sicher archiviert werden (EU-weit).
- Mechanisch erzwungene Unveränderlichkeit von Daten-Shards: Überschreiben wird jetzt technisch ausgeschlossen; ältere Daten werden nur noch lesbar vorgehalten für maximale Langzeitintegrität und Schutz vor unbeabsichtigten Änderungen (EU-weit).
- Werkzeug zur vollständigen Rekonstruktion aus Vault-Daten für valide Wiederherstellung eingeführt (EU-weit).
- Trusted-Key-Root veröffentlicht, inkl. Zeremonie zur Schlüsselrotation, um Integritätssicherung und Vertrauenswürdigkeit von Daten langfristig zu gewährleisten (EU-weit).

### Improved
- Datenvalidierung erweitert: Vergleichskriterien und Integritätsprüfungen für Quartals- und Cross-Quarter-Vergleiche sichern verlässliche und konsistente Auswertungen (EU-weit).
- Statistische Auswertungen für Cross-Quarter-Trends bieten jetzt additive Genauigkeit und Robustheit, wodurch Analysen belastbarer werden (EU-weit).
- Beschriftung in Ergebnistabellen angepasst, damit die verwendeten Bewertungsgrundlagen (Scoring-Version) für Nutzer:innen klar erkennbar sind (EU-weit).
- Verbesserung der Export- und Darstellungslogik im Dashboard: Die Homepagebeschreibung ist nun dynamisch; außerdem wird für mehr Sichtbarkeit strukturierte schema.org-Metadaten eingesetzt (EU-weit).

### Fixed
- Problem mit Datenabgleich behoben: Die Synchronisierung mit der Factory kann jetzt speicherschonend und kollisionssicher arbeiten (EU-weit).
- Mehrere kleinere Fehler im Identitätsabgleich über verschiedene Jahre hinweg wurden behoben, sodass Vermischungen oder Duplikate bei Asset-IDs zuverlässig ausgeschlossen sind (EU-weit).
- Fehlersicherungen bei Scoring und Gruppenzuweisung sorgen dafür, dass gleiche Ausgangsdaten nicht mehr zu doppelten Ergebnissen oder fehlerhaften Zuordnungen führen; zudem werden veraltete Läufe automatisch bereinigt (EU-weit).

### Security & Compliance
- Backfill-Vault-Manifest und Identitäts-Heilungswerkzeuge ermöglichen es, alte Datenbestände DSGVO-konform und konsistent zu rekonstruieren und heilen (EU-weit).
- Geplante Backups vor jedem Versionsupdate erhöhen die Ausfallsicherheit und erfüllen regulatorische Anforderungen an Datenbeständigkeit (EU-weit).

### Integrations
- Validator zur Vergleichbarkeit von Methodik-Hashes stellt konsistente Bewertungsverfahren sicher – wichtig für aussagekräftige länderübergreifende Analysen (EU-weit).
- Schlüsselregister und Rotations-Mechanismen für Kryptographie wurden integriert, um moderne Sicherheitsstandards und revisionssichere Signaturen zu gewährleisten (EU-weit).

## Plattform-Updates für die Woche 2026-06-18 — 2026-06-24

Diese Woche wurden zahlreiche technische Modernisierungen umgesetzt, die die Wartbarkeit und Zuverlässigkeit der Plattform erhöhen. Darüber hinaus wurde das Layout einzelner Webseitenbereiche für eine konsistentere Benutzererfahrung überarbeitet. Im Fokus standen außerdem Aktualisierungen externer Bibliotheken zur besseren Sicherheits- und DSGVO-Kompatibilität.

### Added
- Integration des Prettier-Plugins für Astro, sodass auch Astro-Dateien jetzt nach modernen Formatierungsstandards einheitlich angezeigt werden (EU-weit).

### Improved
- Überarbeitung und Vereinheitlichung der Formatierung aller Webseiten-Komponenten und Datenschutzseiten, wodurch die visuelle Konsistenz verbessert und kleinere Layoutfehler auf Start- und Unterseiten behoben wurden (DE, EU-weit).
- Aktualisierung der wichtigsten externen Abhängigkeiten (u.a. Astro, Node.js-Typdefinitionen, wrangler, sharp und mehrere AI SDKs), was die Kompatibilität, Sicherheit und Performance der Plattform verbessert (EU-weit).

### Fixed
- Kleinere Formatierungs- und Layoutfehler im Dashboard und Footer beseitigt, was zu einem stimmigeren und barrierefreieren Gesamteindruck beiträgt (DE).

### Security & Compliance
- Alle Sicherheitspatches von Drittanbieter-Bibliotheken wurden übernommen und die Codebasis an aktuelle DSGVO/Datenschutzstandards angepasst, um bestmögliche Compliance zu gewährleisten (EU-weit).

### Integrations
- Stärkere Einbindung und Versionsaktualisierung von Cloudflare- und AI-bezogenen Schnittstellen, was die langfristige Wartbarkeit und die Stabilität bei Verarbeitung und Hosting verbessert (EU-weit).

## Plattform-Updates für die Woche 2026-06-11 — 2026-06-17

In dieser Woche wurden zahlreiche Abhängigkeitsupdates durchgeführt, um zukünftige Kompatibilität, Zuverlässigkeit und Sicherheit zu sichern. Zudem werden im Dashboard nun alle Datenpunkte angezeigt, wodurch eine vollständigere Auswertung für Nutzer möglich ist.

### Added
- Im Dashboard werden nun alle Bundesländer, Gewerke und Matrix-Elemente angezeigt, statt nur die Top 8 bzw. 12. Auch Trendauswertungen zeigen jetzt die vollständigen Datensätze, wodurch umfassendere Analysen möglich sind. (DE)

### Improved
- Diverse Aktualisierungen von Kern-Bibliotheken (u.a. Astro, OpenAI, better-sqlite3, Lighthouse, Sharp, csv-parse) sorgen für bessere Stabilität und Performance der Plattform. Dies trägt zu einer reibungsloseren Nutzung und verbesserten Zukunftssicherheit bei. (EU-weit)

### Fixed
- Mehrere Bibliotheken wurden aktualisiert, um kleinere Fehler sowie Kompatibilitätsprobleme zu beheben, insbesondere im Zusammenhang mit Datenverarbeitung und KI-Integrationen. Dies verbessert die Zuverlässigkeit der Anwendungen. (EU-weit)

### Security & Compliance
- Regelmäßige Updates betroffener Bibliotheken und Typdeklarationen erhöhen den Schutz vor potenziellen Sicherheitslücken und helfen, regulatorische Grundanforderungen an Compliance (wie DSGVO) leichter einzuhalten. (EU-weit)

### Integrations
- Updates für Anbindungen an OpenAI und Anthropic AI sorgen für eine stabilere und aktuellere Nutzung von KI-Diensten innerhalb der Plattform. (EU-weit)

## Plattform-Updates für die Woche 2026-06-04 — 2026-06-10

Diese Woche wurden verschiedene Optimierungen am Dashboard vorgenommen, darunter eine verbesserte Darstellung, neue Funktionen zur Integration automatisierter Agenten sowie Aktualisierungen der Dokumentation. Darüber hinaus wurden zahlreiche Abhängigkeiten aktualisiert, um Sicherheit und Kompatibilität mit aktuellen Technologien sicherzustellen.

### Added
- Unterstützung von Agent Readiness im Dashboard: Es wurden maschinenlesbare Schnittstelleninformationen (Link-Header wie api-catalog, service-doc, service-desc, describedby) ergänzt. Dies erleichtert die Integration automatisierter Software-Agenten und verbessert die Anbindung an externe Dienste (EU-weit).
- Die Dokumentation enthält jetzt praxisnahe Beispiele für die DNS-Konfiguration (inklusive DNSSEC-Anforderungen) zur sicheren Anbindung von Diensten sowie neue Hinweise zu öffentlichen Ressourcen ohne Authentifizierung.

### Improved
- Die Benutzeroberfläche für hervorgehobene Bereiche wurde angepasst: Statt eines variablen Farbschemas werden nun feste Blautöne verwendet, was für bessere Lesbarkeit und Klarheit beim Hervorheben von Inhalten sorgt.
- Aktualisierung der interaktiven Anzeigekarten: Zusätzliche Metadaten wie Zeitraum und Stichprobengröße verbessern die Nachvollziehbarkeit dargestellter Informationen.

### Fixed
- Mehrere kleinere visuelle Anpassungen, darunter ein aktualisiertes Favicon für das Dashboard für ein klareres Branding.

### Security & Compliance
- Die Dokumentation wurde um Hinweise ergänzt, wie öffentliche Endpunkte ohne Authentifizierung betrieben werden können. Dies bringt mehr Transparenz bezüglich DSGVO-konformer Zugriffsregeln (EU-weit).

### Integrations
- Mehrere Systembibliotheken und Entwicklungswerkzeuge wurden auf aktuelle Versionen gebracht, inklusive Astro, Cloudflare, OpenAI und anderer KI-Integrationen. Dadurch werden aktuelle Sicherheitsstandards unterstützt und Vorteile neuer Funktionen nutzbar gemacht (EU-weit).

## Plattform-Updates für die Woche 2026-05-28 — 2026-06-03

In dieser Woche wurde die Nutzeroberfläche des Dashboards deutlich optimiert: neue Metrik-Visualisierungen, zahlreiche Barrierefreiheits-Verbesserungen und detaillierte FAQ-Einträge sorgen für mehr Transparenz und Zugänglichkeit. Zugleich wurde die technische Dokumentation und Rechtliches (z.B. Open-Source-Lizenzierung) erweitert, Metadaten für Social Media optimiert und umfangreich strukturierte Daten (Schema.org) ergänzt, um die Sichtbarkeit und Nachvollziehbarkeit zu erhöhen. Damit profitieren Sie von einer moderneren Präsentation, besserer Datenverständlichkeit und mehr Klarheit über den rechtlichen Rahmen.

### Added
- Neue FAQ-Sektion mit 18 zusätzlichen Einträgen zu Methodik, Datengrundlagen, Bewertungslogik, Datenschutzmaßnahmen und statistischer Auswertung – für mehr Transparenz und Nachvollziehbarkeit (DE).
- Ausführliche strukturierte Daten (Schema.org) auf allen Seiten: inkl. Dataset, Breadcrumbs, SoftwareSourceCode, DataDownload, StatisticalPopulation und variableMeasured auf Startseite, Codebook und Methodik. Dies verbessert die Auffindbarkeit, ermöglicht eine klarere Quellenkennzeichnung und unterstützt die automatisierte Weiterverarbeitung von Daten (EU-weit).
- Open Graph- und Twitter Card-Metadaten auf allen Seiten, damit Inhalte beim Teilen in sozialen Netzwerken und Messengern ansprechend und informativ dargestellt werden (EU-weit).
- DOI-Link (Zitierlink) zu Zenodo-Datenbestand im Footer für eine wissenschaftlich korrekte Referenzierung (EU-weit).
- Apache 2.0-Lizenzlink im Footer, deutlich sichtbare Open-Source Ausweisung und Anpassung der Lizenz in strukturierten Daten – erhöht rechtliche Klarheit (EU-weit).
- Navigationslinks zu Forschungskooperationen und Advisory Board im Footer und auf der Methodik-Seite, um die Zusammenarbeit mit Hochschulen und Verbänden zu fördern (DE).
- Ergänzende Glossareinträge zu Handwerksordnung (HWO) und Gewerkeklassifizierung inklusive Links zu offiziellen Quellen (DE).
- Neue Berechnungsgrundlagen, inklusive Maturitätsband-Tabelle mit erklärenden Schwellenwerten und Formel-Dokumentationen zur Scoreberechnung (DE).
- Bidirektionale Links für den Wechsel zwischen deutscher und englischer Dokumentation direkt in den README-Dateien (DE/EN).

### Improved
- Visuelle Überarbeitung aller Metrik-Karten: Farbige Balken zeigen nun auf einen Blick die Bewertungsskala (exzellent/gut/ausreichend/mangelhaft) basierend auf Schwellenwerten, mit besserem Kontrast für Lesbarkeit – erleichtert die intuitive Einordnung der Ergebnisse (DE).
- Glossar und Begriffs-Popover: bessere Textausrichtung, konsistente Schriftgrößen und Integrität, mobile Optimierung sowie semantisch korrektere Auszeichnungen – dies verbessert die Lesbarkeit und Barrierefreiheit insbesondere bei Nutzern mit assistiven Technologien (DE).
- Tabellelemente auf allen relevanten Seiten sind nun numerisch rechtsbündig und damit klarer lesbar (DE).
- Formelblöcke mit KaTeX werden jetzt auch auf Smartphones leserlich angezeigt; horizontales Scrollen und Größenanpassung wurden optimiert (DE).
- Verbesserte Navigationsstruktur (sitemap.xml, Breadcrumbs mit strukturierten Daten) für mehr Übersicht und einfachere Orientierung (EU-weit).
- Alle öffentlichen Seiten enthalten jetzt strukturierte Metadaten (robots.txt, canonical, LLMs-Discovery), was Suchmaschinen und KI-Anwendungen die Indexierung und Nutzung erleichtert (EU-weit).

### Fixed
- Vereinheitlichung der Publisher-Angabe in strukturierten Daten: Wechsel von Organisation auf Person und Korrektur deutscher Begriffe sorgt für konsistente Urheberangaben (DE).
- Das Menü auf Mobilgeräten verwendet nun einen einheitlich weißen Hintergrund anstelle eines durchscheinenden Effekts – für mehr Lesbarkeit und Nutzerfreundlichkeit auf kleinen Bildschirmen (DE).
- Leere Menüreihen (Header) werden auf Nicht-Glossarseiten unterdrückt, um störende leere Zeilen zu vermeiden (DE).
- Fehlerbehebungen bei Scrollverhalten für Ankerlinks und Anpassung der Abstände von Sektionstiteln führten zu einer besseren Nutzerführung (DE).

### Security & Compliance
- Lizenzkennzeichnung umgestellt auf Apache 2.0 sowie Klarstellung der rechtlichen Rahmenbedingungen in Fußzeile, strukturierten Daten und Download-Bereich – dies erhöht Rechtssicherheit beim Datenzugriff und bei der Nachnutzung (EU-weit).

### Integrations
- DOI (Zenodo) Integration im Footer zur eindeutigen und dauerhaften Zitierfähigkeit des öffentlich zugänglichen Datensatzes (EU-weit).

## Plattform-Updates für die Woche 2026-05-21 — 2026-05-27

In dieser Woche wurden zahlreiche Verbesserungen an der HDRI Dashboard Plattform vorgenommen, die die Benutzerfreundlichkeit, Transparenz und Dateninterpretation deutlich erhöhen. Statistische Auswertungen, neue Navigationsoptionen sowie verbesserte Tooltips und Formatierungen tragen dazu bei, dass die Ergebnisse für Nutzer und Entscheidungsträger leichter verständlich und nachvollziehbar sind. Zudem wurde die Einhaltung von Datenschutzstandards bei öffentlichen Datenexporten gestärkt.

### Added
- Breadcrumb-Navigation zu den Codebook- und Methodik-Seiten im HDRI Dashboard, wodurch sich Nutzer leichter zwischen den Seiten orientieren können. (DE)
- Neuer YAML-basierter Datenexport und Download-Links für das Codebook, wodurch die Dokumentation transparenter und einfacher zugänglich ist. (EU-weite Relevanz)
- Tooltipps und Zuverlässigkeitsindikatoren für statistische Kennzahlen (z. B. Perzentile, IQR) anzeigen, was die Nachvollziehbarkeit von Ergebnissen erhöht. (DE)
- Dokumentation zu Messmethoden einschließlich erweiterter FAQ, statistischer Interpretation und Details zu verwendeten Kennzahlen wie P75 und IQR. (DE)
- Neue Navigationslinks und Hyperlinks vom Dashboard zu relevanten Codebook-Abschnitten, wodurch Hintergrundinformationen zu einzelnen Auswertungen direkt erreichbar sind. (DE)
- Gruppierung von Branchen („Gewerk Gruppen“) in Tabellen zur besseren Übersicht und Auswertung, inkl. Anzeige der Gruppenbezeichnung und Beschreibung. (DE)
- Entfernen von Domains in öffentlich bereitgestellten Debug-Artikeln (CSV/JSON), sodass keine Identifikation von Einzelseiten möglich ist und die Anforderungen an den Datenschutz eingehalten werden. (EU-DSGVO)
- Release-Baseline 1.0.0 eingeführt und Versionierung für wichtige Komponenten wie hdri-dashboard und factory festgelegt.

### Improved
- Tooltips sind jetzt dynamisch positioniert und werden nicht mehr abgeschnitten, was die Lesbarkeit deutlich verbessert. (DE)
- Statistische Auswertungen basieren jetzt auf Perzentilen (p10/p50/p75/p90) statt Median, was einen realistischeren Vergleich ermöglicht und den Methodenstandards entspricht. (DE, EU-weit)
- Alle Zahlen- und Datumsangaben werden im Dashboard vereinheitlicht im deutschen Format (z.B. 1.234,56) dargestellt, was die Lesbarkeit und Verständlichkeit für Nutzer in der DACH-Region erhöht.
- Die Schaltflächen und Navigationselemente im Dashboard verwenden jetzt konsistente Stile und Bezeichnungen, um die Benutzererfahrung zu harmonisieren.
- Erweiterte und klarere Tooltip- und Tabellenlayouts für bessere Vergleichbarkeit und höhere Informationsdichte bei statistischen Daten.
- Zugrundeliegende Infrastruktur für Datenexport und Datenbankzugriffe wurde beschleunigt, was zu noch schnelleren Ladezeiten und effizienterer Nutzung führt.

### Fixed
- Behebung von Laufzeitfehlern im Dashboard durch bessere Überprüfung von optionalen Feldern sowie Vervollständigung von Vergleichspunkten, um Anzeigefehler zu vermeiden. (DE)
- Entfernung veralteter und doppelter Assets sowie dynamische Regeneration von Dashboards und Datenarchiven zur Gewährleistung aktueller und korrekter Informationen.
- Textuelle und typografische Vereinheitlichungen in der gesamten Dokumentation und Ergebnisanzeige sorgen für ein konsistenteres Erscheinungsbild.

### Security & Compliance
- Öffentliche Debug-Exports werden automatisch um sämtliche Domains bereinigt, wodurch ein Rückschluss auf Einzelseiten ausgeschlossen ist. Dies erfüllt die Vorgaben des europäischen Datenschutzrechts (DSGVO/GDPR). (EU-weite Relevanz)

### Integrations
- Update der wichtigsten Abhängigkeiten und Schnittstellen zu Cloudflare, Astro, Node.js, DuckDB und weiteren Komponenten, um Kompatibilität für aktuelle europäische Hosting-Plattformen zu gewährleisten. (EU-Cloud-Kompatibilität)

## Plattform-Updates für die Woche 2026-05-14 — 2026-05-20

In dieser Woche wurden zahlreiche Verbesserungen an der Auditierungs- und Datenverarbeitungs-Pipeline umgesetzt. Die Änderungen steigern vor allem die Nachvollziehbarkeit, verbessern die Performance und sorgen durch gezieltere Prüfungen für einen effizienteren Betrieb. Relevante Audits, Datenbankpfade sowie Begriffs- und Formatvereinheitlichungen ermöglichen einen präziseren und datenschutzkonformen Umgang mit europäischen Unternehmensdaten.

### Added
- Auditierungen sowohl mit Lighthouse als auch mit Axe berücksichtigen jetzt ausschließlich tatsächlich erreichbare ("live") Websites, um die Ergebnisqualität und Genauigkeit zu steigern (DE, EU-weit).
- Unterstützung für verschiedene Datenbankpfadformate (pages\__.db und pages-_.db) sowie Zeiträume wie Halbjahre und Quartale: Das erleichtert die flexible Auswertung und Integration von EU-/DE-spezifischen Datenimporten.
- Mehrsprachige Datenabdeckung wurde in der Dokumentation ergänzt: Es ist jetzt transparent einsehbar, wie Filterkaskaden auf Live-Seiten wirken, sodass Mandanten nachvollziehen können, warum bestimmte Domains ausgeschlossen wurden.
- Automatische Verknüpfung und Erkennung von Datenbankpfaden über Gerätekonfigurationen (z.B. ${DEVICE_ID}) vereinfacht installationsübergreifende Abläufe.

### Improved
- Das Datenbank-Schema und die Datenverarbeitungslogik für alle Audit- und Extraktionsschritte wurde vereinheitlicht und für eine bessere Wiederverwendbarkeit angepasst. Begriffe wie 'coreDbPath' wurden in 'registryDbPath' umbenannt (EU-weit), um Klarheit zur Herkunft und Struktur der Unternehmensdaten zu schaffen.
- Caching-Mechanismus optimiert: Ein neuer Cache reduziert die Ladezeiten beim Extrahieren und Prüfen von Webseiten erheblich, was eine spürbare Leistungserhöhung bei großen Datenmengen (z.B. Deutsche Firmenlisten) bewirkt.
- Progress-Anzeigen im Terminal wurden auf einzeilige Statusmeldungen umgestellt, sodass auch große Verarbeitungsläufe übersichtlich und weniger ablenkend dargestellt werden.
- Die Protokollierung und Nachvollziehbarkeit von Audits wurde verbessert: Bereits geprüfte Websites werden zuverlässig übersprungen, was Zeit spart und redundante Prüfprozesse verhindert.
- Plausi­bilitäts- und Validierungs­maßnahmen wurden erweitert, sodass etwa bei fehlenden Datenbanken oder inkonsistenten Perioden-Konfigurationen frühzeitig verständliche Fehlermeldungen ausgegeben werden.

### Fixed
- Datenformate wie Zeiträume wurden einheitlich auf das Schema 'yyyy-qn' (z.B. 2026-q2) normalisiert, was Fehler beim Datenimport und in Berichten minimiert und die Interoperabilität mit anderen europäischen Systemen erhöht.
- Die Zuordnung und Aktualisierung von Webseiten-Startseiten erfolgt nun direkt über die Domain-Kennung; so können fehlerhafte oder doppelte Einträge in Zusammenfassungen vermieden werden (DE, EU-weit).
- Mehrere kleinere Fehler beim Umgang mit geschlossen Datenbankverbindungen sowie bei der Extraktion von Webseiteninhalten (z.B. durch falsche Spaltennamen oder fehlerhafte CSV-Exporte) wurden behoben.
- Missverständliche oder irreführende Angaben in automatisch erzeugten Reports und Dokumentationen wurden für Mandanten verständlicher gemacht.

### Security & Compliance
- Die Filterung und Dokumentation nach DSGVO-konformen Kriterien auf ausschließlich tatsächlich erreichbare Domains wurde sichergestellt (DE, EU-weit).
- Prozessschritte rund um Signaturen und Prüfkettendokumentation wurden für alle Anwendungsbereiche ausgebaut, sodass Nachweis- und Prüfpflichten nach europäischen Standards erfüllt werden können.

### Integrations
- Integration von neuen und bestehenden Datenbankschnittstellen ermöglicht nun eine flexible Anbindung unterschiedlicher Systeme und Datenquellen europäischer Herkunft, wodurch die Mandanten leichter ihre individuellen Abläufe abbilden können.

## Plattform-Updates für die Woche 2026-05-07 — 2026-05-13

In diesem Zeitraum wurden die Verarbeitung von deutschen Postleitzahlen und die Datenauswertung in mehreren Punkten verbessert. Zudem gab es relevante Fehlerbehebungen im Zusammenhang mit der regionalen Sortierung von Gruppen und der Pfadauflösung von Konfigurationsdateien. Diese Optimierungen sorgen für konsistentere regionale Auswertungen, eine klarere Konfiguration und zuverlässigere Datenverarbeitung.

### Added
- Die zentrale Verwaltung des Pfads für kryptografische Transparenzschlüssel wurde eingeführt; dies erleichtert die einheitliche Verwaltung der Schlüssel und reduziert zukünftige Konfigurationsfehler. (DE/ EU-weit)
- Eine ausführliche Dokumentation zur Erstellung von Geräte-Identitätsschlüsseln wurde hinzugefügt, einschließlich Sicherheitsempfehlungen und Schlüsselrotation. So wird die sichere Geräteverwendung transparent für alle Beteiligten erklärt. (EU-weit)

### Improved
- Sortierung der Destatis-Gruppen in allen Berichtstabellen und Statistiken erfolgt jetzt nach der offiziellen römischen Nummerierung (I–VII) statt nach Häufigkeiten. Dadurch sind Vergleiche zwischen Datensätzen und mit anderen offiziellen Statistiken einfacher möglich. (DE)
- Die Konfiguration und Verwendung der deutschen Postleitzahlen-Daten (zipcodes.de.json) wurde vereinheitlicht und mit Fehlermeldungen versehen, um die Datenanreicherung für Bundesländer robuster und nachvollziehbarer zu machen. (DE)
- Bei der Zuordnung von Unterregionen (Bundesländern) werden Konflikte jetzt durch einen dokumentierten Konsens-Algorithmus gelöst, wenn verschiedene Quellen unterschiedliche Ergebnisse liefern. Das verbessert die Nachvollziehbarkeit und Qualität regionaler Auswertungen. (DE)
- Verbesserte Fortschrittsausgaben in der Konsole sorgen für weniger Ausgabeflut bei großen Klassifizierungen – die laufende Zeile wird nun überschrieben, was die Übersichtlichkeit erhöht.

### Fixed
- Die Auflösung des Dateipfades zu zipcodes.de.json wurde korrigiert, so dass die Datei nun in allen Prozessschritten zuverlässig gefunden wird. Fehler beim Laden werden jetzt eindeutig als Fehler behandelt und nicht länger unbemerkt ignoriert. (DE)
- Eine robuste Prüfung sorgt dafür, dass bei fehlender oder nicht lesbarer zipcodes-Datei der Prozess gezielt und mit einer klaren Meldung abbricht, statt mit unvollständigen Teildaten fortzufahren. (DE)
- Die Erkennung und Zuweisung von Manifesten für Apps berücksichtigt nun explizit die app_id anstatt sich auf Verzeichnisnamen zu verlassen. Dadurch ist das System weniger fehleranfällig bei strukturellen Änderungen.
- Mehrere kleine Korrekturen bei der Aggregation von Gruppen sorgen dafür, dass Sonderfälle wie 'unclassified' immer korrekt am Ende der Gruppentabellen platziert werden. (DE)

### Security & Compliance
- Die zentrale Verwaltung und Nutzung der Verifikationsschlüssel für Transparenz (Kryptografie) sorgt für eine einfachere Einhaltung von Compliance-Anforderungen und reduziert Sicherheitsrisiken im Schlüsselmanagement. (EU-weit)

### Integrations
- Die Schnittstelle zur Nutzung zentral verwalteter Transparenzschlüssel wurde vereinheitlicht, sodass künftige Integrationen mit anderen Systemen und Audit-Anforderungen erleichtert werden. (EU-weit)

## Plattform-Updates für die Woche 2026-04-30 — 2026-05-06

In dieser Woche wurden zahlreiche Verbesserungen an der Datenstrukturierung, der rechtlichen Signal-Auswertung und bei geografischen Analysen vorgenommen. Im Fokus standen vor allem eine transparentere, modularere Verarbeitung von rechtlich und inhaltlich relevanten Informationen sowie die Verbesserung der Performance und Nachvollziehbarkeit für Berichte und Audits. Die Änderungen dienen dazu, Ihren Überblick über rechtliche Vorgaben zu erleichtern und liefern detailliertere geografische und inhaltliche Auswertungen für Ihre Website-Analyse.

### Added
- Zusätzliche Extraktion und Auswertung von rechtlich relevanten Seiten wie Impressum, Datenschutz, Cookie-Banner, Copyright-Jahr und Öffnungszeiten. Diese Daten werden jetzt granular in einzelnen Tabellen gespeichert und in den Profilzusammenfassungen (JSON und Markdown) gesondert ausgewiesen, was eine deutlich differenziertere rechtliche Übersicht ermöglicht. (DE, EU-weite Anforderungen)
- Integratives Reporting: Es werden jetzt alle Signalgruppen (Schema.org, rechtliche Seiten, Content-Signale, externe Links, soziale Plattformen) gruppiert und in neuen Übersichtstabellen und Markdown-Berichten dargestellt. Das erleichtert die Auswertung und Compliance-Prüfung für Ihre Domains.
- Erfassung der genutzten technischen Umgebung (CPU, RAM, Betriebssystem, Node.js-Version usw.) für tiefgreifende Audits. Dies erhöht die Transparenz und Nachvollziehbarkeit von Audit-Ergebnissen, besonders im regulatorischen Kontext. (EU-weit)

### Improved
- Die Rechtssignalerkennung (z.B. für Impressum und Datenschutz) wurde um eine auf Schlüsselwörtern basierende Bewertung erweitert. Das verbessert die Genauigkeit bei der Einordnung rechtlicher Seiten und gibt Hinweise zur Erfüllung von DSGVO/Impressumspflichten.
- Das Zusammenführen von Daten aus mehreren Quellen bietet jetzt eine verbesserte Übersicht zu deduplizierten Domains, Kategorien und Entstehungshistorie. Ihre Berichte werden dadurch präziser und leichter nachvollziehbar. (DE)
- Die Steuerung und Dokumentation der Hintergrundprozesse, insbesondere bei der Verarbeitung und Klassifizierung großer Datenmengen, wurde transparenter gestaltet. Der Fortschritt wird jetzt für den Betreiber regelmäßig ausgegeben.

### Fixed
- Fehlerhafte Zählweise bei Öffnungszeiten behoben – die Auswertung berücksichtigt jetzt korrekt den vorgesehenen Datenbank-Spaltennamen, was verlässliche Übersichten in den Standort-Profilen ermöglicht. (DE)
- Korrekte Pfadauflösung für die Speicherung von Auswertungen sichergestellt, wodurch Ergebnisdateien nun garantiert im richtigen Ausgabeverzeichnis landen und Verwirrung bei der Archivierung vermieden wird.
- Optimierte Zuordnung von Bundesland- und Gemeindedaten sowie präzisere Normalisierung von Bundeslandnamen (z.B. „Sachsen“, „Niedersachsen“, „Berlin“), um eine zuverlässige geografische Aufschlüsselung in allen Berichten zu gewährleisten. (DE)

### Security & Compliance
- Die neu strukturierte Speicherung und Auswertung rechtlicher Informationen (wie Impressum, Datenschutz, Cookie-Banner und Copyright-Hinweise) erleichtert die Einhaltung von DSGVO, TMG und anderen EU-rechtlichen Vorgaben, mit gezielter Erkennung und Zählung entsprechender Seiten je Domain. (DE, EU-weit)

### Integrations
- Erweiterte Unterstützung für die Auswertung und Zählung unterschiedlichster externer Links und sozialer Medien auf Ihren Websites. Dies sorgt für einen vollständigen Überblick über externe Abhängigkeiten und mögliche Integrationen mit Drittanbietern.

## Plattform-Updates für die Woche 2026-04-23 — 2026-04-29

In dieser Woche wurden die Datenqualität, Übersichtlichkeit und Nutzbarkeit der Plattform weiter verbessert – insbesondere durch optimierte Klassifikation, genauere Berichte und eine komplett überarbeitete Pipeline zur Kategorisierung und Standortauswertung (DE, EU). Zudem wurde der Datenschutz durch die Pflege von regionalen Daten (z. B. PLZ Deutschland) und klarere Herkunftsangaben weiter gestärkt.

### Added
- Erweiterte Ausgabe (v2) des Branchenindex mit verbesserten Berichten und Auswertungen, darunter tabellarische und geografische Zusammenfassungen sowie Exportmöglichkeiten in verschiedenen Formaten (DE, EU).
- PLZ-Datensatz für Deutschland ergänzt, wodurch die regionale Auswertung von Branchendaten weiter verbessert wird (DE).

### Improved
- Branchen-Klassifizierung: Die Zuordnung von Websites zu Branchen erfolgt jetzt noch zuverlässiger, indem mehrfach zugeordnete Kategorien pro Website ausgewertet und regionale wie thematische Aspekte besser berücksichtigt werden (DE, EU).
- Automatische Berichte und Tabellen zur Verteilung von Gewerken und Standorten sind jetzt übersichtlicher und liefern geordnet nach Bundesland und Gemeinde mehr Kontext sowie einen einfacheren Vergleich (DE).
- Die gesamte Pipeline für Branchenindex und Standorte wurde umfassend dokumentiert und auf Transparenz bei Quellen und Abläufen optimiert (u.a. explizite Quellennennung für PLZ-Datensatz, neue Leitfäden für Nutzer) (DE, EU).

### Fixed
- Testdatenquellen wurden aus den Branchenindex-Eingabedaten entfernt, um falsche oder irreführende Ergebnisse zu vermeiden (DE).

### Security & Compliance
- Herkunftsangabe für verwendete PLZ-Daten (Syrokomskyi/postal-codes auf GitHub) ergänzt und in den Konfigurationsdokumenten ausgewiesen – Bedeutung u.a. für die Transparenz nach DSGVO (DE, EU).

## Plattform-Updates für die Woche 2026-04-16 — 2026-04-22

Im aktuellen Update wurden wesentliche Funktionen zur Datenaggregation, Auswertung und Veröffentlichung eingeführt. Darüber hinaus wurden zahlreiche Maßnahmen zur Verbesserung der DSGVO-Konformität (EU-weit) sowie zur Nachvollziehbarkeit und Transparenz implementiert. Die Plattform ist damit bestens für öffentlich einsehbare Indikatoren und Berichte gerüstet.

### Added
- Neue Module für Jahresbericht, Open Data und Abzeichen: Die Plattform erstellt nun einen Jahresbericht, generiert offene Datensätze und integriert ein Gütesiegel zur öffentlichen Darstellung wichtiger Kennzahlen (EU-weit).
- Erweiterung der K-Anonymität- und Self-Report-Funktionen: Die Datenauswertung wurde mit K-Anonymitätsmechanismen sowie mit einer Möglichkeit für Nutzer zur eigenen Dateneinsicht und -prüfung erweitert, was dem Datenschutz und der Transparenz dient (DSGVO, EU-weit).
- Einführung öffentlicher Projekt-Governance: Die Beratung durch unabhängige Experten und die Dokumentation des Governance-Prozesses stärken die Vertrauenswürdigkeit, Objektivität und rechtliche Absicherung des Projekts (EU-weit).
- Veröffentlichung eines Open-Source-Codebooks für das Scoring: Klare Beschreibung der Bewertungsmethodik und -regeln ermöglicht unabhängige Nachvollziehbarkeit (EU-weit).
- Startmodul für Branchenerkennung, Kataloganalyse und Dublettenprüfung, um Daten aus Firmenkatalogen automatisiert auszuwerten (DE).

### Improved
- Leistungsverbesserung und moderne Bibliotheken für CSV-Exporte: Exportfunktionen nutzen nun eine aktuelle externe Bibliothek, was die Zuverlässigkeit und Kompatibilität beim Datenexport deutlich erhöht.
- Optimierte Nachvollziehbarkeit und Monitoring: Neue Protokollierungs- und Orchestrierungsfunktionen machen Datenverarbeitung und Fehleranalyse transparenter und zuverlässiger (EU-weit).
- Erweiterte Dokumentation für Endnutzer und KI-gestützte Agenten, um Transparenz und Support zu erhöhen.

### Fixed
- Diverse Qualitätsverbesserungen, darunter Korrekturen bei der Datenverarbeitung und Fehlerbehebung im Self-Reporting und Publishing, sorgen für reibungslosere Abläufe im Plattformbetrieb.

### Security & Compliance
- Umfassende Erweiterungen zur DSGVO-Umsetzung und Stärkung der Datenschutzmechanismen, wie die Integration von K-Anonymität und Möglichkeit zur Selbstkontrolle durch Endnutzer (EU-weit).

### Integrations
- Integration externer CSV-Bibliotheken für performanten und standardkonformen Datenexport.
