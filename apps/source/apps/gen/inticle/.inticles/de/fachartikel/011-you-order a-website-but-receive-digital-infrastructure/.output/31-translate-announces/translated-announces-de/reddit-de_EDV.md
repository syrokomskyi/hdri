Technisch wirkt eine kleine Website für ein lokales Unternehmen oft wie eine einfache Aufgabe, bis der Betrieb beginnt. Dann zeigt sich, dass das Problem nicht im ersten Launch liegt, sondern in Änderungen, Daten, Abhängigkeiten, Releases und in der Fähigkeit, das System ein Jahr später reproduzieren zu können.

- Statische Generierung mit Astro und TypeScript und Deployment auf Cloudflare ist nicht deshalb interessant, weil es ein moderner Stack ist. Der Sinn liegt darin, dass eine ganze Klasse von Runtime-Komplexität entfällt: eine Datenbank für jede Seite, serverseitige Generierung bei jedem Request, eine Plugin-Kette und die ständige Notwendigkeit, Erweiterungen zu patchen. WordPress kann bei fachkundiger Betreuung gut funktionieren, aber ein statisches Modell verteilt Risiken schlicht anders.

- Content als Daten ist wichtiger, als es zunächst scheint. Wenn Seiten in Markdown/YAML über typisierte Blöcke beschrieben werden und Preise, Adressen und Unternehmensdaten in kanonische Dateien ausgelagert sind, wird das System überprüfbar. Man kann nicht versehentlich beliebigen HTML-Code in den Seiteninhalt einfügen, das Raster eines einzelnen Abschnitts zerstören oder vergessen, einen alten Preis auf der fünfzehnten Seite zu aktualisieren. Das ist nüchterne Ingenieursarbeit, aber genau sie hält die Ordnung aufrecht.

- Ein gesteuerter Lebenszyklus von Änderungen ist auch für kleine Projekte notwendig. Die Materialisierung einer Änderung, Migration, Validierung, Release-Vorbereitung, Abgleich und Änderungshistorie klingen für die Website einer Werkstatt überdimensioniert. Die Alternative sind jedoch Änderungen am Live-System, ein unklarer Zustand der Dateien und die Abhängigkeit davon, wer sich an was erinnert. In der EDV-Praxis ist das ein bekanntes Problem: Das Fehlen eines Prozesses wird immer selbst zu einem Prozess, nur zu einem schlechten.

Wo verläuft Ihrer Erfahrung nach die sinnvolle Grenze zwischen einer einfachen statischen Seite und einer vollwertigen Infrastruktur für die Betreuung?

---
