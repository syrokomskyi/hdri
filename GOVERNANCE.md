# Projekt-Governance

> [English Version](GOVERNANCE.en.md)

Dieses Dokument beschreibt, wie das Projekt Handwerk Digital Readiness Index (HDRI) derzeit organisiert und gesteuert wird und wie sich dieses Governance-Modell bei wachsender Beteiligung durch weitere Mitwirkende oder institutionelle Partner weiterentwickeln kann.

HDRI ist derzeit ein unabhängiges Open-Source-Projekt, das von einer Privatperson in Backnang, Baden-Württemberg, Deutschland initiiert und gepflegt wird. Aktuell besteht keine institutionelle Trägerschaft, keine formale Anbindung an eine öffentliche Stelle, keine Forschungsinstitution und keine Unternehmensstruktur im Hintergrund des Projekts.

## 1. Zweck dieses Dokuments

Dieses Dokument dient dazu, transparent zu machen:

- wer aktuell Verantwortung für das Projekt trägt;
- wie technische und organisatorische Entscheidungen getroffen werden;
- wie externe Mitwirkende sich beteiligen können;
- wie künftige Governance-Rollen ausgestaltet werden können, falls das Projekt wächst.

Ziel ist es, Transparenz, Verlässlichkeit und eine nachvollziehbare Grundlage für die Zusammenarbeit mit Mitwirkenden, Nutzerinnen und Nutzern, Forschungseinrichtungen, Handwerksorganisationen, Ministerien und weiteren potenziellen Partnern zu schaffen.

## 2. Aktuelles Governance-Modell

HDRI folgt derzeit einem **Single-Lead-Modell mit offener Mitwirkung**.

Das bedeutet:
- die Entwicklung des Projekts erfolgt öffentlich und nachvollziehbar;
- Beiträge externer Mitwirkender sind ausdrücklich willkommen;
- die Letztverantwortung für Roadmap, Architektur, Releases und Repository-Pflege liegt derzeit beim Project Lead.

Dieses Modell entspricht der aktuellen Größe und Reife des Projekts. Es ist bewusst schlank gehalten und schafft zugleich klare Verantwortlichkeiten.

## 3. Rollen

### 3.1 Project Lead

Der Project Lead ist verantwortlich für:

- die grundsätzliche inhaltliche und technische Ausrichtung des Projekts;
- die Freigabe wesentlicher architektonischer und methodischer Entscheidungen;
- die Sicherstellung der Konsistenz zwischen technischer Umsetzung und öffentlicher Zielsetzung des Projekts;
- Release-Entscheidungen und administrative Verantwortung für das Repository;
- die externe Vertretung des Projekts gegenüber potenziellen Partnern und Institutionen.

Aktueller Project Lead:

- **Name:** Andrii Syrokomskyi
- **Ort:** Backnang, Baden-Württemberg, Deutschland
- **Kontakt:** über das GitHub-Profil und Repository-Issues

### 3.2 Maintainer

Maintainer sind besonders vertrauenswürdige Mitwirkende, denen Review- oder Schreibrechte für definierte Bereiche des Repositories übertragen werden können.

Maintainer können:
- Pull Requests prüfen und zusammenführen;
- bestimmte technische Teilbereiche betreuen;
- die Einhaltung von Standards in Bezug auf Code, Dokumentation, Tests und Datenschutz unterstützen;
- an Entscheidungen zu wesentlichen Änderungen mitwirken.

Derzeit ist der Project Lead zugleich der einzige Maintainer.

Weitere Maintainer können künftig benannt werden, wenn über einen längeren Zeitraum qualitativ hochwertige Beiträge, Verlässlichkeit im Review-Prozess und eine erkennbare Übereinstimmung mit der öffentlichen Zielsetzung des Projekts vorliegen.

### 3.3 Contributors / Mitwirkende

Mitwirkende sind Personen oder Organisationen, die sich insbesondere durch folgende Beiträge beteiligen:
- das Eröffnen von Issues;
- Vorschläge zur Verbesserung;
- Pull Requests;
- Verbesserungen an der Dokumentation;
- Fehlermeldungen;
- fachliche, methodische oder analytische Beiträge.

Aus der Mitwirkung allein entsteht kein automatischer Governance-Anspruch. Governance-Verantwortung entwickelt sich schrittweise auf Basis kontinuierlicher Beiträge und gewachsenen Vertrauens.

## 4. Entscheidungsfindung

### 4.1 Laufende Entscheidungen

Laufende technische Entscheidungen werden im Rahmen der üblichen Repository-Prozesse getroffen, insbesondere über Issues, Pull Requests, Code Review und Dokumentationsänderungen.

### 4.2 Wesentliche Entscheidungen

Wesentliche Entscheidungen sollen vor ihrer Umsetzung öffentlich in GitHub-Issues oder Pull Requests diskutiert werden. Dies gilt insbesondere für:

- grundlegende Änderungen am Scoring-Modell oder Codebook;
- Änderungen an Ontologie, Datenstrukturen oder Auswertungslogik;
- Änderungen mit Auswirkungen auf Datenschutz, Anonymisierung oder Veröffentlichungsregeln;
- größere architektonische Umstellungen;
- inkompatible Änderungen an Outputs, Schnittstellen oder Dashboards.

Soweit sinnvoll, sollen solche Vorschläge als RFC gekennzeichnet werden.

### 4.3 Letztverantwortung

Das Projekt strebt öffentliche Diskussion und sachlich begründeten Konsens an. Solange jedoch keine weitergehende Governance-Struktur etabliert ist, liegt die Letztverantwortung für Entscheidungen beim Project Lead.

Mitwirkende sind verpflichtet, die [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) einzuhalten.

## 5. Beiträge und Review

Alle nichttrivialen Änderungen sollen über Pull Requests eingebracht werden.

Von Mitwirkenden wird erwartet, dass sie:
- Änderungen angemessen eingrenzen;
- wo relevant Tests ergänzen;
- die Dokumentation aktualisieren, wenn sich Verhalten oder Outputs ändern;
- konstruktiv auf Review-Rückmeldungen reagieren.

Pull Requests werden vor dem Merge geprüft. Für Änderungen mit Bezug zu Datenschutz, öffentlichen Datenausgaben oder methodischer Validität kann ein vertiefter Review erforderlich sein.

## 6. Releases und offizielle Ergebnisse

Der Default-Branch des Repositories bildet den aktuellen Entwicklungsstand des Projekts ab.

Getaggte Releases sind die bevorzugte Grundlage für:
- öffentliche Demonstrationen;
- reproduzierbare Analysen;
- externe Evaluationen;
- institutionelle Prüfungen;
- die Bereitstellung von Dashboards oder abgeleiteten Ergebnissen.

Release Notes sollen wesentliche Änderungen, mögliche Migrationsfolgen sowie relevante methodische Anpassungen dokumentieren.

## 7. Zusammenarbeit mit Institutionen

HDRI ist offen für die Zusammenarbeit mit öffentlichen Institutionen, Handwerksorganisationen, Forschungseinrichtungen, Civic-Tech-Akteuren und Unternehmen.

Eine solche Zusammenarbeit führt nicht automatisch zu Governance-Rechten über Repository oder Projektausrichtung.

Falls sich aus einer Zusammenarbeit künftig eine formalisierte Struktur ergibt — etwa in Form von Beiratsfunktionen, Co-Maintainership oder einer Steering Group — wird dies ausdrücklich in diesem Dokument oder in einer Nachfolgefassung festgehalten.

Bis zu einer solchen formalen Regelung liegt die Governance beim Project Lead und bei ausdrücklich benannten Maintainers.

## 8. Änderungen an diesem Dokument

Dieses Dokument kann im Verlauf der Weiterentwicklung des Projekts angepasst werden.

Änderungsvorschläge sollen über Pull Requests eingebracht werden. Im aktuellen Entwicklungsstadium bedürfen Änderungen der Freigabe durch den Project Lead.

---

Alle Beiträge und der Quellcode des Projekts werden unter der **[Apache License 2.0](LICENSE)** veröffentlicht.
