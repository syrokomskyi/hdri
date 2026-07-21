## Content als Daten, nicht als Chaos aus Korrekturen

Seiten werden deklarativ beschrieben – in Markdown und YAML, über ein Array von Blöcken, wobei jeder Block einen Typ und Parameter hat. Im Seiteninhalt gibt es kein beliebiges HTML oder JSX. Die Blöcke sind typisiert und werden anhand eines Schemas validiert.

Die Folge: Seiten werden nicht jedes Mal „neu gezeichnet“, sondern aus prüfbaren Elementen zusammengesetzt. Weniger zufällige Defekte, weniger Abweichungen zwischen Bereichen.

Geschäftsdaten sind separat ausgelagert – Preise, rechtliche Angaben, Adressen, Kontaktpunkte. Sie werden nicht in Texten und Komponenten hart codiert, sondern an einer einzigen kanonischen Stelle gespeichert und per Referenz eingefügt. Auf den ersten Blick ist das ein Detail für Ingenieure. Tatsächlich ist es eine direkte Antwort auf ein Problem, das jedem Geschäftsinhaber vertraut ist: Der Preis ändert sich, das Büro zieht um – und zwanzig Seiten müssen manuell angepasst werden, wobei fünf vergessen werden. Hier erfolgt die Änderung in einer Datei und wird über die gesamte Website hinweg übernommen.
