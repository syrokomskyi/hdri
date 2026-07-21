## Bereitschaft zur maschinellen Lesbarkeit ist keine zusätzliche Schicht

Suche wird zunehmend maschinell vermittelt: Ein Teil der Zielgruppe erhält Antworten über KI-Assistenten. Das ist ein erkennbarer Trend. Aber eine Website so zu konzipieren, dass sie nicht nur für Menschen, sondern auch für Maschinen verständlich ist, ist schon heute sinnvoll.

Deshalb ist die semantische Ebene direkt in den Aufbau integriert. Jede Seite erhält einen Graphen strukturierter Daten im JSON-LD-Format – mit Entitäten wie Organization, WebSite, BreadcrumbList, Service, Person, FAQPage, je nach Seitentyp. Zusätzlich werden maschinenlesbare Textindizes `llms.txt` und `llms-full.txt` sowie ein strukturiertes Discovery-Dokument `.well-known/agent.json` für agentische Szenarien generiert. Die Datei `robots.txt` steuert den Zugriff von Crawlern.

Das erhöht die Maschinenlesbarkeit, garantiert aber weder die Aufnahme in KI-Antworten noch Zitierungen oder Positionen in den Suchergebnissen. `llms.txt` und ähnliche Formate sind derzeit keine offiziellen Webstandards. Ich baue die Website so, dass sie für Maschinen verständlich ist. Das ist Vorbereitung, kein Versprechen von Sichtbarkeit.

Wichtig ist, diese Ebene nicht mit Programmatic SEO (unten) zu verwechseln: Die eine beantwortet die Frage, ob eine Maschine eine bereits bestehende Seite versteht; das andere, wie viele relevante Seiten überhaupt entstehen.
