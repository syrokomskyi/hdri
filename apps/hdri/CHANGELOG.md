# Changelog

All notable changes to the `hdri` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Erstelle CHANGELOG.md, changelog.config.yaml und extrahiere extract.config.yaml Dateien für alle relevanten Pakete und Apps.
- Füge Changelog-Links zu allen README.md Dateien hinzu.
- Füge Smart-Upgrade-Skript mit Major-Version-Pinning hinzu.

### Changed
- Benenne @wgogol/changelog-live nach @warpgogol/changelog-live um, aktualisiere alle Verweise und Pakete.

### Fixed
- Downgrade von TypeScript 7.0.2 auf 6.0.3 zur Sicherstellung der Kompatibilität mit typescript-eslint.
- Schließe Testdateien in tsconfig.json von HDRI Factory Apps explizit aus.
- Behebe Fehler beim Kopieren des eslint-rules Verzeichnisses im HDRI Export.
- Entferne versehentlich veröffentlichte Dateien mit geleakten AWS STS Zugangsdaten.

### Removed
- Entferne versehentlich veröffentlichte Dateien mit geleakten AWS STS Zugangsdaten.

### Security
- Entferne versehentlich veröffentlichte Dateien mit geleakten AWS STS Zugangsdaten.

### Documentation
- Erstelle und erweitere CHANGELOG.md sowie Agentendokumentation (AGENTS.md), erneuere Einträge und ergänze Verlinkungen in sämtlichen READMEs.

## 2026-07-23 .. 2026-07-29

### Added
- Stelle fehlende package.json-Dateien in allen relevanten Paketen und Apps wieder her.
- Füge README.md zur Dokumentation hinzu.

### Changed
- Führe ein Projekt-Refactoring durch und verschiebe alle Inhalte aus 'apps/source/*' direkt ins Wurzelverzeichnis.
- Aktualisiere Abhängigkeiten in allen Arbeitsbereichspaketen.
- Räume pnpm-Installationswarnungen auf, um das Build-Erlebnis zu verbessern.
- Entferne 'code-compass' aus den DevDependencies und Skripten sämtlicher package.json-Dateien.
- Vereinheitliche genutzte Vitest-Versionen über alle Projekte.

### Fixed
- Behebe Probleme mit fehlenden package.json-Dateien in mehreren Apps und Paketen.

### Removed
- Lösche veraltete oder doppelte Verzeichnisse und Dateien nach dem Struktur-Refactoring.
- Entferne veraltete per-Typ-Write-Wrapper im 'observatory-vault'.

### Documentation
- Vereine AGENTS.md und ergänze Projektdokumentation und Inventar.
- Passe Dokumentations- und Konfigurationsdateien an die neue Projektstruktur an.

## 2026-07-09 .. 2026-07-15

### Added
- Füge Matomo-Analytics mit datenschutzfreundlicher Konfiguration zum Dashboard hinzu.
- Integriere eine Hintergrundanimation mit animierten Bausteinen und konfigurierbaren Kontrast- und Animationsparametern in das Dashboard.
- Ergänze einen Changelog-Link im Footer des Dashboards, der die Anzahl der Einträge anzeigt.
- Füge einen externen Linkindikator für Links mit target="\_blank" hinzu.

### Changed
- Verwende überall die IBM Plex Schriftfamilie und passe das Farbschema sowie die UI-Designs für ein flacheres, übersichtlicheres Erscheinungsbild an.
- Aktualisiere Glossar, FAQ und Methodikseite zur Vereinheitlichung der Begriffe (u.a. Veröffentlichungsschwelle statt k-Anonymität), passe die Reifestufen und deren Darstellung an, und korrespondiere FAQ-Artikel mit Verlinkungen.
- Lockere die Metadatenzeile und ändere das Label für den Export auf "Dashboard-Stand".
- Optimiere die Darstellung der Maturity-Bar sowie der Meta- und Footer-Bereiche für bessere Lesbarkeit und Struktur.
- Stelle sicher, dass Tooltip- und SEO-Module projektübergreifend verwendet werden und entferne Redundanzen.
- Sortiere und aktualisiere die Darstellung sowie interaktive Elemente (wie die Sortierpfeile) in Tabellen nach Nutzerfreundlichkeit.
- Vereinheitliche alle UI-Radien auf asymmetrische Ecken.

### Fixed
- Korrigiere Rechtschreibung und terminologische Inkonsistenzen in den deutschen Dokumentationen sowie auf der Oberfläche des Dashboards.
- Behebe das Sortierverhalten der Vergleichstabellen und verhindere Fehlauslösungen bei Klicks auf Infomarker.
- Markiere das Matomo-Skript korrekt als inline-Skript und entferne eine überflüssige TypeScript-Deklaration.

### Removed
- Entferne tote oder nicht mehr genutzte Komponenten wie DimensionsChart, GermanyMap und MatrixHeatmap sowie die zugehörigen CSS-Dateien aus dem Dashboard.

### Documentation
- Pflege die README-, AGENTS- und Changelog-Dateien im Dashboard konsequent nach und ergänze fehlende oder veraltete Einträge.

## 2026-07-02 .. 2026-07-08

### Added
- Füge MODULE_CONTRACT und CHANGE_SUMMARY Annotationen zu verschiedenen Konfigurations- und Quellcodedateien hinzu.

### Changed
- Benenne das Paket @org/compass-checks in @wgogol/compass um und benenne anschließend @wgogol/compass zu @wgogol/code-compass um.
- Führe vollständige Umbenennung des Namens GRACE auf COMPASS in allen Paketen, Quellcodedateien, Tests und Build-Konfigurationen durch.

### Fixed
- Teile die Implementierung von EnrichBundeslandGogol.ts und ParseSourcesGogol.ts in kleinere, fokussierte Module auf.
- Teile export-hdri-dashboard-archive.ts im Digital Observatory in einzelne, spezialisierte Module auf.

### Removed
- Entferne Altpakete und nicht mehr benötigte Dateien infolge der COMPASS-Umbenennung.

### Security
- Verbessere Quellcode-Nachverfolgung und Klarheit durch Ergänzung von Modulkontrakten und Änderungsanmerkungen.

### Documentation
- Dokumentiere den GRACE-zu-COMPASS-Umbenennungsprozess sowie strukturierte Umstellungen und Änderungen der Pipeline.

## 2026-06-25 .. 2026-07-01

### Added
- Füge neue Validierungsgates für Datenqualitätsdrift, Methodologie-Komparabilität und population-frame Readiness hinzu.
- Implementiere Offsite-Replikation für Vaults mit geplanten Prüfungen sowie ein Shard-Manifest und geplante CI-Integritätschecks.
- Erweitere das System um Aufbewahrungs- und Wiederaufbauwerkzeuge, einschließlich rebuild-from-vault, snapshot-Werkzeuge und tiered Storage für obs_json.
- Integriere ein Trusted-Keys Root CA mit Key-Rotation-Zeremonie sowie ein Mechanismus zur mechanischen Unveränderlichkeit von Vault Shards.
- Baue eine stabile Asset-Identity-Registry mit Backfill- und Heilungsmechanismen über Jahre hinweg auf.
- Biete ein Modell für Business Lifecycle Events (WP13) und Methodologie-Snapshots pro Periode an.
- Stelle ein Population-Frame-Validator- und Template sowie ein backfill-identity Tool bereit.
- Erweitere das Dashboard um die Anzeige des WP15 Methodik-Changelogs und verbessere schema.org-Metadaten sowie dynamische Homepagedeskription.
- Füge Stats- und Vergleichswerkzeuge zur Erhöhung der statistischen Aussagekraft über Quartalstrends hinzu.
- Ermögliche opt-in Kontakt-Extraktion für das Impressum in der Factory und ein Runbook zum Desaster Recovery.

### Changed
- Stelle den Node/pnpm-Runtime explizit ein und pinne die Versionen zur besseren Reproduzierbarkeit.
- Optimiere verify:vault durch Streaming für eine bessere Performance und ermögliche versionierte Migrationen mit Backups.
- Refaktoriere interne Seitenstruktur im Dashboard für besseren Code-Aufbau.

### Fixed
- Beschrifte pipeline_runs.codebook_version jetzt mit der effektiven Scoring-Version.
- Heile Fälle mit inkonsistenter Asset-Identität über Jahreswechsel und erhöhe die Langlebigkeit von DuckDB-Tests durch längere Timeouts.
- Behebe Kollisionen und Speicherprobleme bei der Factory-Synchronisation sowie Idempotenzprobleme bei Scoring und GC von überholten Runs.

### Removed
- Entferne nicht mehr benötigte Codeabschnitte in Zusammenhang mit Storage- und Validationsprozessen.

### Security
- Verstärke die mechanische Unveränderlichkeit von Vault Shards durch Schreibschutz und verhindere Überschreibungen.

### Documentation
- Ergänze und aktualisiere LONGEVITY.md, RUNBOOK.md und das Desaster Recovery Runbook für bessere Nachvollziehbarkeit.
- Pflege METHODOLOGY.md mit neuen statistischen Methoden für Cross-Quarter Analysen.

## 2026-06-18 .. 2026-06-24

### Added
- Füge das Prettier-Plugin für Astro zur Entwicklungskonfiguration hinzu.

### Changed
- Aktualisiere diverse Abhängigkeiten und AI SDKs im gesamten Monorepo, darunter @types/node, astro, wrangler, sharp, prettier sowie mehrere interne Pakete.
- Formatiere Quellcode, Stylesheets und Konfigurationsdateien über alle Projekte hinweg für konsistenten Stil.
- Strukturiere diverse Hilfstexte, Markdown-Dokumentationen und Prompts für einheitlicheres Auftreten und Klarheit um.
- Passe die package.json-Dateien mit aktuellen Versionen wichtiger Bibliotheken und verbesserten Datei-Arrays an.

### Fixed
- Behebe kleinere Anzeigefehler und verbessere das Layout auf der Startseite des HDRI Dashboards und in einzelnen Komponenten.

### Removed
- Entferne nicht mehr genutzte Dokumentationsreferenzen in mehreren pipeline-spezifischen Markdown-Dateien.

### Documentation
- Überarbeite und vereinheitliche zahlreiche README- und Hilfedokumente in Anwendungen und Paketen für bessere Verständlichkeit.

## 2026-06-11 .. 2026-06-17

### Changed
- Entferne Slice-Limits aus den Dashboard-Datenarrays, um alle Bundesländer, Gewerke und Matrix-Einträge samt Trend-Daten vollständig anzuzeigen.
- Aktualisiere zahlreiche Abhängigkeiten in mehreren Paketen und Anwendungen, darunter bessere-sqlite3, astro, @anthropic-ai/sdk, openai, playwright, @cloudflare/workers-types, wrangler, ai, tldts, csv-stringify, csv-parse, vitest, lighthouse und sharp.

## 2026-06-04 .. 2026-06-10

### Added
- Füge YAML-Frontmatter zu auth.md hinzu, um öffentliche read-only Nutzung ohne Authentifizierungsanforderung zu kennzeichnen.
- Implementiere Agent Readiness Features im hdri-dashboard: unterstütze Link-Header (api-catalog, service-doc, service-desc, describedby), füge webmcp.ts hinzu, erweitere meta-card um Datenattribute (period, sample-size) und konfiguriere DNS-AID inklusive SVCB-Record-Beispiel und DNSSEC-Anforderung.

### Changed
- Führe mehrere Dependency-Updates in hdri-dashboard, Workspace-Paketen und Hilfspaketen durch.
- Ersetze im term.css die CSS Custom Property --layer-schema vollständig durch fest codierte Blauwerte für Hintergrund, Hover, Fokus und Box-Shadow.
- Aktualisiere das Favicon von hdri-dashboard.

### Documentation
- Ergänze die README mit DNS-AID Konfiguration, SVCB Record Beispiel und DNSSEC Voraussetzung für hdri-dashboard.

## 2026-05-28 .. 2026-06-03

### Added
- Fügen Sie zahlreiche neue Schema.org-Markups (Dataset, FAQPage, TechArticle, BreadcrumbList, StatisticalPopulation, variableMeasured, SoftwareSourceCode, DataDownload, Open Graph und Twitter Card Metadaten) auf allen Seiten hinzu, um die Sichtbarkeit und Struktur für Suchmaschinen und soziale Medien zu verbessern.
- Erweitern Sie die methodik, Startseite und Codebook-Seiten um mathematische Formel-Dokumentation, Scoring-Details und KaTeX-LaTeX-Rendering für wissenschaftliche Nachvollziehbarkeit.
- Integrieren Sie einen DOI-Link zum Zenodo-Datensatz und einen Apache-2.0-Lizenz-Link in die Fußzeilennavigation.
- Fügen Sie neue FAQ-Einträge mit detaillierten Erklärungen zu Methodik, Datenschutz und Berechnungen hinzu und erstellen Sie eine Glossartabelle sowie Verweise auf offizielle Handwerksordnungen und Destatis-Klassifikationen.
- Gestalten Sie Dashboards mit einer neuen, vollbreiten Reifegrad-Klassifizierungs-Tabelle und sorgen Sie für mobile-optimierte, scrollbar formatierten KaTeX-Formeln.
- Erstellen Sie ausführliche GOVERNANCE-, METHODOLOGY- und RUNBOOK-Dokumentationsverweise in allen deutschen und englischen README-Dateien; unterstützen Sie bidirektionale Sprachnavigation in der Dokumentation.
- Binden Sie .env.example-Dateien für alle Apps und Packages ein, um die Konfiguration zu standardisieren.

### Changed
- Aktualisieren Sie das Favicon-Icon-Design und diverse Manifest-Zeitstempel.
- Verbessern Sie die Navigation im Layout und platzieren Sie die MaturityBar-Komponente vor der Leseleiste auf der Startseite.
- Optimieren Sie das MaturityBar-Band auf eine konsolidierte Darstellung, entfernen Sie das Vorbild-Band und verwenden Sie eine programmatische Zuordnung von Segmenten.
- Stellen Sie Schema.org-Lizenzen und Publisher von Organization auf Person um; korrigieren Sie die Schreibweise von Stichprobengröße und andere Metadaten-Labels.
- Passen Sie Tabellenstile, Farben und Ausrichtungen für Karten, Tooltips und Glossarbegriffe an und verfeinern Sie die IQR/Statistikvisualisierung anhand semantischer Farbklassen.
- Überarbeiten Sie internationale Domänenbezüge von handwerk-digitals.de zu handwerk-index.de und modernisieren Sie alle Querverweise und Veröffentlichungslinks in der Dokumentation.
- Extrahieren Sie Footer- und Visualisierungs-Komponenten, konsolidieren Sie die Dashboard-Visualisierung und vereinfachen Sie die Buildstruktur durch Entfernen externer D3-Abhängigkeiten.

### Fixed
- Beheben Sie Probleme mit Schriftgrößen-Vererbung, Kontextformatierung und konsistenter Ausrichtung von Tabellen, Tooltips und Glossarbegriffen auf allen Seiten.
- Überarbeiten Sie Importlogik für YAML-Codebook, um Umgebungsunterschiede robust zu behandeln und Pfadfallbacks einzubauen.

### Removed
- Entfernen Sie detaillierte Erläuterungstexte zu Reifegrad-Bändern, fusionieren Sie FAQs aus der Fußzeile und beseitigen Sie redundante Farb-/Legenden-Elemente auf der Startseite.
- Löschen Sie alte codebook YAML-Versionen und nicht mehr benötigte Manifest-Trenddateien, um das Repository zu bereinigen.

### Security
- Verbessern Sie den Datenschutz-Nachweis durch Erweiterung der Datenquellendokumentation und explizite Datenschutzabschnitte in README und methodik.

### Documentation
- Hinterlegen Sie vollständige LLM- und Kontextdateien, AI.txt und LLMS.txt/full.txt sowie umfangreiche Nutzerführung und Migrationshinweise in allen zentralen Dokumenten.

## 2026-05-21 .. 2026-05-27

### Added
- Füge AXE-Accessibility-Audit-Indikatoren zur Ontologie und neue Dimension „accessibility_audit“ mit Missing-Policy und countClampInverse-Regel in den Codebook-Daten ein.
- Erstelle neue Workspace- und Exportpipeline für hdri-dashboard inklusive automatischer Datenexporte und Basisstruktur als eigenständige App.
- Füge Version-Felder in allen package.json-Dateien der hdri-dashboard-, hdri-factory- sowie digital-observatory-Anwendungen hinzu, um eine Release-Basislinie (1.0.0) zu etablieren.
- Implementiere Minimalanzeige für Exportfortschritt und Console-Protokolle beim Dashboard-Archiv-Export und Signing-Prozessen sowie logge Fortschritt bei AXE-Audit-Signaturen.
- Füge umfangreiche Tooltips und statistische Kennzahlen (IQR-Balken, Reliabilitätsindikatoren, FAQ, Methodenerläuterung zu P75/IQR/Beschreibende Statistik) zu Methodik und Dashboard-Oberfläche hinzu.
- Ergänze Breadcrumb-Navigation für Codebook- und Methodikseiten, sowie Navigationslinks im Dashboard und in der Methodik für Transparenz.
- Füge gewerk_group/Industriegruppierung in Asset-Stati und Cohort-Mitglieder zur besseren Aggregation hinzu.

### Changed
- Ersetze median durch p50, führe p10/p90-Perzentile in Kohortenstatistiken und Rankings ein und sortiere Matrix-, Slice- sowie Dimensions-Rankings nach p75.
- Wechsle Codebook-Export von JSON auf YAML als einzige Datenquelle, reformatiere und versioniere CHANGELOG/Notizen systematisch und extrahiere Versionsangaben automatisiert.
- Optimiere Styling und Lesbarkeit der Tooltips, Beschriftungen und Karten durch tabular-nums, einheitliche Klassen und Verbesserungen der Layouts.
- Passe alle HDRI-Label und Dokumentationen um die Bedeutung „Handwerk Digital Readiness Index“ an und erläutere die HDRI-Akronym-Erklärung in Codebook, Ontologie und READMEs.
- Stelle Zahlendarstellung auf konsistente deutsche Locale-Formate um (score, Zahl, Datum, Zeit), vereinheitliche Formatierung in Count-, Prozent- und Datumsfunktionen.
- Passe default Logic für consent_quality-Scoring an (von zero zu skip für not_applicable/default); gleiche Codebook-Gewichtungen an (legal 28 %, contact 22 %, accessibility 16 %, etc.).
- Ersetze alle Roh-Console-Ausgaben im Pipeline- und Bundlingprozess durch strukturierte NDJSON-Logger mit Kontextinformationen und event-basierten Namen.

### Fixed
- Behebe Fehler bei der Optional-Chaining-Logik und sorge dafür, dass alle Vergleichsobjekte vollständige Felder beinhalten und Manifest-Dateien im Export gefunden werden.
- Bereinige Debug- und Public-Exportdaten von sensitiven Domain-Angaben und entferne große statische CSVs, um den Datenschutz und die Wartbarkeit der Debug-Artefakte sicherzustellen.
- Stelle gewerk_group in Emissionen aus Datenbank-Mappings wieder her, nachdem Spalte zuvor entfernt war.

### Removed
- Entferne die nicht mehr benötigte statische Visualisierung ‚Semantic Content Stack‘ aus dem Dashboard-Hero und lösche nicht versionskontrollierte Build-Artefakte sowie Alt-Funktionalitäten (JSON-Codebook-Export, Fixtures, Astro-TypeDefs, große statische Debug-CSV).

### Security
- Bereinige öffentlich geteilte Debug-Artefakte konsequent von Domains und schütze damit vor unerwünschter Offenlegung von Webseitenidentitäten im Datenexport.

### Documentation
- Erweitere und überarbeite READMEs in digital-observatory und hdri-dashboard mit Erläuterungen zu HDRI, zur Datenmart-Terminologie, zu Export- und Regenerations-Workflows für das Dashboard, sowie zu statistischer Methodik und Datenquellenbeschreibung.

## 2026-05-14 .. 2026-05-20

### Added
- Füge in a-contract-ontology Brief Unterstützung für sechs neue upstream database Pfadfelder hinzu und ermögliche geräteabhängige Platzhalter-Substitution für device-spezifische Pfadauflösung.
- Füge factoryContractRootDir Feld in digital-observatory Brief für automatische Pfaderkennung hinzu und erweitere SyncFromFactoryGogol zur Priorisierung von expliziten Pfaden, Auto-Discovery und Legacy-Fallback.
- Erweitere observations-Tabelle in digital-observatory um period, factory_run_id und crawl_hash Felder zur direkten Periodenfilterung und Verfolgung der Herkunft.
- Integriere period/factory_run_id/crawl_hash Unterstützung bei der Synchronisation von Observations aus Emit Bundles und anderen digitalen Fabrik-Komponenten, inklusive period-basierten Tabellendeklarationen und Tests.

### Changed
- Optimiere auditSampleSize-Konfiguration in audit-lighthouse Brief temporär von -1 auf 3 und erneut auf -1 für beschleunigte Pipeline-Iterationen und spätere Aufhebung der Begrenzung.
- Aktualisiere mehrere Package-Abhängigkeiten auf neueste Versionen und normalisiere die Reihenfolge in package.json-Dateien diverser Pakete.

### Fixed
- Korrigiere Datenbank-Joins, um die lokale site_pages-Tabelle in Übersetzungsvorgängen zu verwenden, wodurch fehlerhafte Abfragen gegen leere oder nicht existierende Tabellen in TranslateProfileObservationsGogol und TranslateOntologyGogol behoben werden.

### Removed
- Entferne veraltete TranslateProfileObservationsGogol- und IngestAssetStatesGogol-Skripte sowie zugehörige Tests, um die Datenaufnahme und Beobachtungsableitung auf den aktuellen, kanonischen Synchronisationspfad via emit-bundle zu konsolidieren.

## 2026-05-07 .. 2026-05-13

### Added
- Füge getTransparencyKeysDir() als zentrale Methode zur Auflösung des transparency keys-Pfads hinzu und verwende sie in VerifyUpstreamGogol, um Redundanzen zwischen Apps zu vermeiden.
- Dokumentiere die Erzeugung von Geräte-Identitätsschlüsseln inklusive Sicherheits- und Platzierungshinweisen.
- Dokumentiere die Phase 1 Pipeline, Signatur-Verifikationssystem und die neue Konfigurationsstruktur für gemeinsame Einstellungen wie zipcodesTablePath.

### Changed
- Berechne transparencyDir explizit aus repoRoot in config.ts und stelle so die Stabilität der Keys-Auflösung unabhängig von der App-Verschachtelungstiefe sicher.
- Passe VerifyUpstreamGogol.findManifestPath an, sodass nach manifest.app_id statt nach Verzeichnisnamen gefiltert wird, um robust gegen Schritt-Nummerierungen zu bleiben.
- Verlege zipcodesTablePath von app-lokalem brief.md in die Fabrik-Konfiguration und stelle rootBrief als gemeinsame Pipeline-Variable zur Verfügung; lasse EnrichBundeslandGogol und SnapshotHarvestGogol bei Fehlen der Datei sofort abbrechen.

### Fixed
- Korrigiere die Pfadauflösung von zipcodesTablePath in SnapshotHarvestGogol, sodass nun briefInputDir anstatt ctx.inputDir für die Bestimmung verwendet wird.
- Behebe das Laden von zipcodes.de.json in brief.md und fehlerhafte Fehlerbehandlung in loadGeoIndex, sodass Fehler jetzt mit einem Error anstatt null signalisiert werden.

### Removed
- Entferne transparencyDir aus config.ts zugunsten der zentralen Logik für transparency keys in @org/observatory-crypto.

### Documentation
- Erweitere RUNBOOK.md um Anleitungen zur Geräteschlüssel-Generierung und Konfiguration, sowie um Pipeline-Beschreibungen und Hinweise zur gemeinsamen Konfiguration.

## 2026-04-30 .. 2026-05-06

### Added
- Führe neue ext\_\* Signal-Tabellen (Schema.org, Legal, Content, Externe Links, Social) ein und erweitere SummarizeProfileGogol zur Aggregation aller Signalgruppen mit neuem Markdown-Report und erweiterten Profil-Snapshots.

### Changed
- Benenne den Counter 'extracted' in allen 37 Extraction-Gogols in 'parsed' um, um die tatsächliche HTML-Parsing-Funktionalität widerzuspiegeln; aktualisiere dazu Variablendeklarationen, Log-Nachrichten und das extract-report.json-Output.
- Benenne die Pipeline-ID und Referenzen von 'crawl' zu 'crawl-pages' in CrawlGogol um, um Kollisionen im Pipeline-Definition- und Registry zu verhindern.

### Fixed
- Behebe die CAS-Dateipfadauflösung in allen Extraction-Gogols, sodass storage_path nun mit getContentRootDir() korrekt auf outputRootDir basiert.
- Korrigiere die openingHoursCount-Abfrage in SummarizeProfileGogol, sodass sie korrekt auf die Spalte 'text' der ext_opening_hours-Tabelle zugreift, anstelle einer nicht existierenden 'present'-Spalte.

### Removed
- Entferne die split-input Batches aus dem Eingabeverzeichnis von industry-index.

## 2026-04-23 .. 2026-04-29

### Added
- Ergänze Ausgabe v2 des Branchenindex mit diversen neuen Berichten, Datensätzen und Zusammenfassungen für verschiedene Verarbeitungsschritte.
- Füge neue Postleitzahlen für Deutschland hinzu.

### Changed
- Ersetze alle Vorkommen von 'Bavaria' durch 'Bayern' in den Postleitzahlen-Daten.

### Removed
- Entferne eine Testquelle aus dem Input-Branchenindex und bereinige die zugehörigen Quelldateien.

## 2026-04-16 .. 2026-04-22

### Added
- Führe eine interaktive Smoke-Test-Suite für die App catalog-harvest hinzu, inklusive Testszenarien und neuer Datenquellen.
- Erweitere die App catalog-harvest um weitere Firmenkataloge für die Batch-Verarbeitung.

### Changed
- Optimiere den Parser für Katalogdaten sowie mehrere Klassifizierungsregeln in apps/catalog-harvest und business-core.

### Fixed
- Behebe kleinere Inkonsistenzen in den Klassifizierungsregeln und Parser-Funktionen für Firmendaten.
