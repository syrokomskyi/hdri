Website-Architektur als steuerbare Infrastruktur

Der Artikel analysiert einen Ansatz, bei dem die Website eines lokalen Unternehmens nicht als Sammlung von Seiten betrachtet wird, sondern als reproduzierbares Artefakt: statische Generierung mit Astro und TypeScript, Deployment auf Cloudflare, deklarativer Content in Markdown/YAML und Validierung anhand von Schemas.

Die zentrale Idee besteht darin, Geschäftsdaten von beliebigen Änderungen zu trennen. Preise, Adressen, Unternehmensangaben und Kontaktpunkte liegen in kanonischen Dateien, während die Seiten aus typisierten Blöcken zusammengesetzt werden. Das senkt das Risiko von Abweichungen zwischen Bereichen und macht Änderungen überprüfbar.

Eine separate Ebene ist die Informationsarchitektur. Service Pages und lokale Seiten werden nicht massenhaft nur der Menge wegen erstellt. Sie durchlaufen Gates: Nachfrage, tatsächliche Nachweise, einzigartiges Material, Aktualität und Budget. Eine schwache Seite wird nicht standardmäßig indexierbar.

Semantik ist in den Build integriert: JSON-LD für Entitäten, FAQ, Breadcrumbs, Service, Organization; llms.txt und agent.json als Vorbereitung auf maschinelles Lesen. Ohne Sichtbarkeitsversprechen. Nur infrastrukturelle Bereitschaft.

Das ist ein nützliches Framework für Entwickler, SEO-Spezialisten und technische Berater, die Websites als Systeme planen und nicht als visuelle Layouts.

Tags: seo, webarchitecture, astro, structureddata, localseo, digitalstrategy

---
