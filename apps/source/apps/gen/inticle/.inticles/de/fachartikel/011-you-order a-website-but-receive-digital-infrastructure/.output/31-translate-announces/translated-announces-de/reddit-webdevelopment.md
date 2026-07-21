In der Webentwicklung werden kleine Websites als technische Objekte oft unterschätzt. Doch die Website eines lokalen Unternehmens kann äußerlich einfach wirken und zugleich eine ernsthafte Architektur für Daten, Build, Releases und Ownership erfordern.

- Statische Generierung mit Astro und TypeScript ist hier nicht an sich wertvoll. Der Wert liegt darin, dass die Website zu einem kompilierten Artefakt wird: ohne serverseitige Generierung jeder einzelnen Seite, ohne Datenbank für das Rendering, ohne eine Plugin-Kette, die dauerhaft betreut werden muss. Das macht andere Ansätze nicht schlecht. Es ist einfach ein anderes Risikoprofil, insbesondere für Websites, deren Content kontrolliert und nicht stündlich geändert wird.

- Deklarativer Content und typisierte Blöcke lösen ein typisches Wartungsproblem. Wenn Seiten in Markdown/YAML beschrieben, nach einem Schema validiert und Geschäftsdaten separat ausgelagert werden, hängt der Entwickler weniger von manuellen Prüfungen und beliebigem HTML innerhalb des Contents ab. Ein Preis, eine Adresse oder eine Unternehmensangabe wird an einer Stelle geändert und nicht über eine Suche im gesamten Repository.

- Der interessante Teil sind programmatische Leitplanken für Design und Release-Prozess. Tokens, CSS-Variablen, das Verbot hartcodierter Farben, Validierung, Änderungshistorie und die Sperre direkter Änderungen an der Live-Site machen selbst ein kleines Projekt zu einem steuerbaren System. Das kann überdimensioniert wirken - bis zum ersten Vorfall, bei dem man verstehen muss, was genau geändert wurde und warum die Kommunikation nicht mehr funktioniert.

Welchen minimalen Satz architektonischer Regeln würden Sie selbst bei einer kleinen Website für ein lokales Unternehmen zugrunde legen?
