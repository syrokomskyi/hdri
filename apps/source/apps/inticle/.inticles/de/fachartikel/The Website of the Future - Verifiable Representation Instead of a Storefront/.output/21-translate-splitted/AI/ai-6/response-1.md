## Zwei Ebenen, eine Quelle der Wahrheit

Der häufigste Architekturfehler, den ich sehe, ist folgender: eine „Website für Menschen“ zu bauen und separat dazu einen „Aufbau für Agenten“. So sollte man es nicht machen.

Die menschliche Oberfläche und der maschinelle Vertrag sind zwei Projektionen eines einzigen kanonischen Geschäftsmodells. Preis, Leistung, Bedingung und Verfügbarkeit werden einmal beschrieben, maschinenlesbar, und aus dieser Quelle werden sowohl die Seite für Menschen als auch die Antwort für den Agenten gerendert. Eine Abweichung zwischen dem, was ein Mensch sieht, und dem, was ein Agent erhält, ist ein Defekt und keine Funktion.

Wenn ich sage „die Website ist keine separate API“, dann meine ich genau das: Die maschinelle Ebene ist kein seitlich angebauter Zusatz, sondern die zweite **Projektion** desselben Kerns. Die Website bleibt nicht deshalb das Zentrum, weil sie ein vertrautes Format ist, sondern weil das Unternehmen bereits über das verfügt, worauf seine Präsenz beruht – die eigene Domain und das Zertifikat als Ankerpunkt der Identität. Ein Satz vertrauenswürdiger Daten ist ohne einen solchen Anker letztlich herrenlos. Die Website gibt ihm sowohl eine Adresse als auch einen Eigentümer.

Daher rührt auch meine nüchterne Haltung gegenüber dem Hype um „agent-ready Design“. Semantisches HTML, sauberes JSON-LD, Inhalte ohne verpflichtendes JavaScript-Rendering, eine stabile Struktur und Barrierefreiheit – was eine Website gut gebaut macht, macht sie auch für Agenten geeignet. Derselbe „Accessibility Tree“, der Screenreadern hilft, unterstützt nach derselben Logik auch das strukturelle Lesen durch KI-Agenten. Maschinenlesbarkeit sollte ein Nebenprodukt guter Bauqualität sein und keine separate, verkäufliche Schicht. Kaufen Sie keinen magischen Aufbau – bauen Sie sauber, und die grundlegende maschinelle Ebene entsteht zu einem großen Teil aus derselben Disziplin.

Aber das gibt es nicht kostenlos. Signierte Aussagen, Protokolle und Zugriffsebenen sind reale operative Last, und ihre Kosten für ein konkretes Unternehmen sind im Voraus ehrlich gesagt unbekannt.
