Eine Unternehmenswebsite wird üblicherweise als Schaufenster gedacht – ein Ort, an dem ansprechende Gestaltung und ein überzeugender Ton den Besucher zum Geschäftsabschluss bewegen. Aber ich sehe immer häufiger: Diese Metapher beginnt gegen das Unternehmen zu arbeiten. Die ersten Schritte eines Geschäfts – Suche, Vergleich, Auswahl, Vorkalkulation – übernehmen bereits nicht mehr Menschen, sondern ihre KI-Agenten. Einem Agenten ist die Ästhetik der Startseite gleichgültig, wenn sich daneben Preis und Verfügbarkeit von einem Dutzend Anbietern auf einmal leicht vergleichen lassen.

Daraus folgt eine harte Arbeitshypothese: In agentenvermittelten Märkten wird alles, was sich in eine gewöhnliche Ware verwandeln lässt, zur Ware gemacht werden (für diesen Prozess gibt es ein Wort: „Kommodifizierung“). Damit verschiebt sich die zentrale Frage des Website-Inhabers. Die Frage lautet nicht mehr: „Wie überzeugend ist mein Schaufenster?“, sondern: „Was in meinem Unternehmen kann ein Agent nicht nur lesen, sondern prüfen?“

Die kurze Antwort. Die Website der Zukunft ist weder ein Schaufenster noch eine separate API, sondern eine **prüfbare** Repräsentanz des Unternehmens. Eine einheitliche Quelle der Wahrheit, auf die Mensch und Agent gleichermaßen zugreifen.

Im Folgenden zeige ich, wie eine solche Architektur aufgebaut ist und warum ich Prüfbarkeit – nicht Gestaltung – für den nachhaltigsten Vorteil halte. Ich schränke sofort ein: Ich spreche von technischen Invarianten, nicht von rechtlicher Eindeutigkeit, die heute (und vermutlich noch lange) niemand versprechen kann.

---

# Die Website der Zukunft: prüfbare Repräsentanz statt Schaufenster

## Warum dem Agenten das Schaufenster gleichgültig ist

Wenn ein Mensch vergleicht, wirken Gestaltung, Ton, Reputationssignale und der allgemeine Eindruck für Sie. Wenn ein Agent vergleicht, verwirft er alles, was sich nicht strukturiert lesen lässt, und reduziert Ihr Unternehmen auf einen Satz vergleichbarer Parameter. Wenn dieser Satz nur aus Preis, Fristen und Basiseigenschaften besteht, gerät das Unternehmen in einen reinen Warenvergleich – unabhängig davon, wie gut es tatsächlich arbeitet.

Genau hier liegt die Falle. Auf Maschinenlesbarkeit zu verzichten, ist keine Option: Der Agent wird Sie ohnehin vergleichen, nur schlechter und ohne Ihre Kontrolle darüber, was er sieht. Aber. Wenn Sie maschinell nur die kommodifizierbaren (wir kennen dieses Wort bereits) Fakten unterscheidbar machen, beschleunigen Sie mit eigener Hand Ihren eigenen Tod.

Deshalb formuliere ich die Aufgabe anders. Die Frage ist nicht, ob man maschinenlesbar sein soll, sondern **wodurch genau** Sie maschinell unterscheidbar werden. Machen Sie nicht nur Preis und Verfügbarkeit vergleichbar, sondern auch prüfbare nicht-kommodifizierbare Attribute: Herkunft, Qualifikation, unterzeichnete Garantien, Historie ausgeführter Arbeiten, Grenzen der Verantwortung. Dann wird Agent-Readiness von einer Bedrohung zu einem Schutz – nach meiner Überzeugung zum nachhaltigsten Vorteil, der einem Unternehmen bleibt, wenn Maschinen den Vergleich übernehmen.

Ich ziehe sofort eine Grenze. Prüfbares Vertrauen ersetzt die im B2B üblichen Mechanismen nicht – Marke, persönliche Beziehungen, Empfehlungen, lokale Bekanntheit. Für Dienstleistungsunternehmen zum Beispiel in Baden-Württemberg entscheiden oft genau Reputation und Beziehungen über den Abschluss. Prüfbarkeit verdrängt sie nicht. Sie macht einen Teil dieses Vertrauens übertragbar und maschinell unterscheidbar, damit ein Agent dort nicht Leere sieht, wo Sie in Wirklichkeit belegbare Qualifikation und Historie haben.

## Fakten kann man vergleichen, Vertrauen muss man prüfen

Ich schlage vor, eine einfache Unterscheidung im Kopf zu behalten. Sie organisiert die gesamte Architektur.

**Vergleichbare Fakten** sind das, was ein Agent sauber und ohne Vermutungen lesen können muss: Leistungen, Preisspannen, Verfügbarkeit, Fristen, Einschränkungen, Einsatzgebiete. Diese sollten als ordentliches maschinenlesbares Modell ausgeliefert werden.

**Vertrauensbedürftige Aussagen** sind das, was man nicht einfach auf eine Seite schreiben und erwarten kann, dass man es glaubt: Identität, Qualifikation, Garantie, Reputation, Verantwortung für das Ergebnis. Vertrauen lässt sich nicht „rendern“. Es muss geprüft werden.

Daraus folgt ein technisches Prinzip: Dort, wo eine Aussage Risiko, Versprechen, Garantie, Verantwortung oder die Bestätigung der Herkunft trägt, ist das Signierte wichtiger als das Sichtbare. Eine solche Aussage existiert als prüfbares signiertes Nachweisstück, getrennt vom unsignierten Seitentext. Für gewöhnliche beschreibende Inhalte ist das natürlich überzogen.

Konkrete Mechanismen – kryptografische Signaturen, verifizierbare Nachweise nach W3C, Bindung von Identität an eine Domain über DNS und TLS – nenne ich als Beispiele für Ansätze, nicht als bereits siegreiche Standards. Entscheidend ist nicht die Technologie an sich, sondern die Funktion: dem Agenten eine Vertrauensquelle zu geben und nicht nur einen gerenderten Absatz.

Und noch eine Einschränkung. Signiert zu sein bedeutet nicht automatisch rechtliche Verbindlichkeit oder kommerzielle Überzeugungskraft. Kryptografische Prüfung ersetzt nicht den institutionellen, rechtlichen und operativen Kontext von Vertrauen – sie macht nur einen Teil der Fakten maschinell unterscheidbar.

## Zwei Ebenen, eine Quelle der Wahrheit

Der häufigste Architekturfehler, den ich sehe: eine „Website für Menschen“ zu bauen und separat eine „Erweiterung für Agenten“. So sollte man es nicht machen.

Das menschliche Interface und der maschinelle Vertrag sind zwei Projektionen desselben kanonischen Geschäftsmodells. Preis, Leistung, Bedingung, Verfügbarkeit werden einmal maschinenlesbar beschrieben, und aus dieser Quelle werden sowohl die Seite für Menschen als auch die Antwort an den Agenten gerendert. Eine Abweichung zwischen dem, was der Mensch sieht, und dem, was der Agent erhält, ist ein Defekt, keine Funktion.

Wenn ich sage „die Website ist keine separate API“, meine ich genau das: Die maschinelle Ebene ist kein seitlicher Anbau, sondern die zweite **Projektion** desselben Kerns. Die Website bleibt nicht deshalb das Zentrum, weil sie ein gewohntes Format ist, sondern weil das Unternehmen bereits über das verfügt, worauf eine Repräsentanz beruht – die eigene Domain und das Zertifikat als Punkt der Identitätsverankerung. Ein Satz vertrauenswürdiger Daten ohne einen solchen Anker bleibt herrenlos. Die Website gibt ihm sowohl eine Adresse als auch einen Eigentümer.

Daraus erklärt sich auch meine gelassene Haltung gegenüber dem Hype um „agent-ready Design“. Semantisches HTML, sauberes JSON-LD, Inhalte ohne obligatorisches JavaScript-Rendering, stabile Struktur und Barrierefreiheit – alles, was eine Website gut gebaut macht, macht sie auch agententauglich. Derselbe „Accessibility Tree“, der Screenreadern hilft, hilft nach derselben Logik auch dem strukturellen Lesen durch KI-Agenten. Maschinenlesbarkeit sollte ein Nebenprodukt von Bauqualität sein, nicht eine separate verkäufliche Schicht. Kaufen Sie keine magische Aufsatzlösung – bauen Sie korrekt, und die grundlegende maschinelle Ebene entsteht zu großen Teilen aus derselben Disziplin.

Aber das gibt es nicht umsonst. Signierte Aussagen, Protokolle und Zugriffsebenen sind eine reale operative Last, und ihre Kosten für ein konkretes Unternehmen lassen sich im Voraus ehrlich gesagt nicht kennen.

## Die Grenze der Irreversibilität verläuft über den Menschen

Ich schließe mich bewusst nicht der radikalen These an, „KI-Agenten werden Websites und Menschen ersetzen“.

Ein Agent kann einen großen Teil des Weges selbst gehen: finden, Eignung prüfen, eine Konfiguration zusammenstellen, einen Preis berechnen, einen Entwurf vorbereiten, Dokumente zusammentragen. Aber eine bindende, finanzielle, rechtlich relevante oder irreversible Handlung erfordert menschliche Bestätigung. Das ist keine vorübergehende Beschränkung „bis die Technologie ausgereift ist“. Es ist eine dauerhafte Grenze der Verantwortung.

Die Formel, die ich als Axiom halte: **Der Agent bereitet vor – der Mensch bindet.**

Ich spreche hier von Website-Architektur, nicht von rechtlicher Eindeutigkeit. Wer genau für den Fehler eines autonomen Agenten haftet – der Nutzer, das Unternehmen, der Modellanbieter oder die Plattform –, hängt von der Jurisdiktion und der künftigen Praxis ab. Hier Eindeutigkeit zu versprechen, ist kaum möglich. Aber der architektonische Beitrag der Website ist real: Sie kann Verantwortung zuweisbar machen, indem sie Mandat, Umfang der Befugnisse, Bestätigung und den signierten Beleg jeder Handlung festhält. Die Aufgabe der Website ist nicht, Streitigkeiten zu entscheiden, sondern Beweise zu erzeugen.

## Minimales Modell einer Vertrauensebene

Damit die Vertrauensebene nicht abstrakt klingt, beschreibe ich sie über drei Rollen. Das sind **meine eigenen Metaphern, keine Branchenstandards**. Ich habe sie auf drei reduziert, weil sie drei unterschiedliche Fragen eines KI-Agenten abdecken: Wer sind Sie, was wurde getan und worauf aus eingehendem Text ist Verlass.

- **Vertrauenspasse.** Eine Ebene verifizierbarer Identität und Reputation: Wer ist dieses Unternehmen, welche belegbare Qualifikation hat es, und lässt sich diese an reale institutionelle Wurzeln binden? Der Agent vergleicht Anbieter nicht nur nach Preis, sondern auch nach verifizierbarer Leistungsbilanz.
- **Bordjournal.** Rechenschaft und schriftliche Spur: Was wurde getan, von wem, wann, in welchem Umfang der Befugnisse und mit welcher Bestätigung.
- **Herkunftsregister.** Schutz vor eingeschleusten fremden Anweisungen. Als strategisches Ideal stützt sich der eingehende Agent auf kryptografisch beglaubigte Angebote und Fakten, nicht auf beliebigen Seitentext. In einer Welt, in der ein kompromittiertes CMS, gefälschte Bewertungen oder ein Drittanbieter-Widget zur Waffe werden können, wirkt signierte Herkunft als Schutzmechanismus. Das ist eines der möglichen Schutzprinzipien.

Auf dieses Gerüst legen sich Zugriffsebenen ganz natürlich: offene Auffindbarkeit von Katalog und Richtlinien, authentifiziertes Lesen persönlicher Konditionen und schließlich Ausführung – aber nur nach menschlicher Bestätigung.

## DACH und DSGVO: eine Begrenzung, die zum Vorteil werden kann

Für Unternehmen in Deutschland und im weiteren DACH-Raum wird der regulatorische Rahmen oft als Bremse wahrgenommen. In der Agentenökonomie sehe ich ihn eher als Vorsprung.

Datenminimierung by design passt gut zu agentischen Abläufen. Standardmäßig stellt der Agent parametrisierte Fragen („passt es?“, „welcher Preis für dieses Volumen?“), und das Unternehmen liefert parametrisierte Fakten zurück – ohne das vollständige Nutzerprofil zu übertragen. Personenbezogene Daten fließen nur bei ausdrücklicher Einwilligung, mit protokolliertem Beleg darüber, was genau offengelegt wurde. Diese Richtung nenne ich DSGVO-by-construction: Einwilligung und schriftliche Spur sind in die Architektur eingebaut und nicht nachträglich angeklebt.

Aber das ist bislang ein Prinzip, kein fertiges Modell. Der konkrete UX und die rechtliche Form einer solchen Einwilligung sind mir nicht bekannt.

Dazu passt auch die Idee, dass Vertrauen von unten aus bestehenden Wurzeln föderiert wird. Man muss nicht auf einen globalen Monopolisten oder ein Register vertrauenswürdiger Agenten warten. Logischer ist es, sich auf das zu stützen, was dem Unternehmen bereits gehört: Domain, Zertifikat und Nachweise, signiert von bestehenden Autoritäten – Kammern, Berufsregistern, Qualifikationsinstituten. Für eine Region wie Baden-Württemberg sind das natürliche Wurzeln des Vertrauens.

Ob diese Institutionen heute bereit sind, als Cross-Signer aufzutreten, ist offen. Aber als Strategie, die gegenüber einer Vereinnahmung durch neue Plattformen robust ist, halte ich den „Weg von unten“ für vorzugswürdig: Er stützt sich auf bereits anerkannte Autoritätsquellen, statt ein neues Abhängigkeitszentrum zu schaffen.

## Horizonte: Wie man Invarianten von Hype trennt

Die praktischste Antwort, die ich derzeit geben kann: Binden Sie Ihre Strategie nicht an ein konkretes KI-Agenten-Protokoll. Das Feld wird noch lange ein Zoo von Standards bleiben. Das kanonische Geschäftsmodell sollte dem Unternehmen selbst gehören, und nach außen wird es über austauschbare Adapter projiziert – heute der eine, morgen ein anderer. Jede „Discovery-Datei“ oder Konvention ist als günstiges, austauschbares Artefakt sinnvoll, aber nicht als Fundament.

Diese Logik lässt sich bequem auf drei Horizonte verteilen.

Am **nahen Horizont** ändert sich die technische Disziplin. Die Ebene aus einer Quelle der Wahrheit wird zur Norm guter Bauqualität, und die Differenzierung verschiebt sich in Richtung prüfbares Vertrauen. Meine Wette gilt architektonischer Robustheit.

Am **mittleren Horizont** wird die Ökonomie der Verifikation sichtbar. Je stärker Agenten „das Kommodifizierbare kommodifizieren“, desto mehr werden prüfbare nicht-kommodifizierbare Attribute zur Grundlage der Differenzierung. Ein Unternehmen ohne prüfbare Vertrauenssignale riskiert, vom Agenten als Warenanbieter wahrgenommen zu werden – unabhängig von seiner tatsächlichen Qualität. Ob der wirtschaftliche Gewinn von prüfbarem Vertrauen abhängen wird? Dafür braucht es Forschung.

Am **fernen Horizont** wage ich keine Aussagen über konkrete Interfaces – Neurointerfaces, Augmented Reality, Hologramme … Für langlebig halte ich nur eines: Wie auch immer das Interface aussieht, überlebt ein prüfbarer, übertragbarer Nachweis darüber, wer Vertrauen verdient. Identität, Herkunft, Rechenschaftspflicht – sie sind dauerhaft. HTML, Protokolle und selbst das „Web“ sind austauschbar.

## Fünf Fragen zur Selbsteinschätzung

Damit all das zu einem Werkzeug und nicht zu einer Weltanschauung wird, hier fünf Fragen. An den Antworten wird sichtbar, ob Sie ein Schaufenster oder eine prüfbare Repräsentanz bauen.

1/ Was ist bei Ihnen **für die Maschine vergleichbar** – stellen Sie Leistungen, Preise, Fristen und Einschränkungen als sauberes maschinenlesbares Modell bereit?
2/ Was ist bei Ihnen **prüfbar** – welche Aussagen zu Qualifikation, Garantie und Herkunft existieren als signierte Nachweise und nicht nur als Text auf der Seite?
3/ Wo liegt bei Ihnen **die menschliche Bestätigung** – sind bindende und irreversible Handlungen von dem getrennt, was der Agent selbst vorbereitet?
4/ Wo haben Sie **eine Quelle der Wahrheit** – stellt Ihre Architektur sicher, dass Mensch und Agent dasselbe sehen?
5/ Wovon sind Sie **nicht als einzigem Protokoll abhängig** – besitzen Sie Ihr Geschäftsmodell, statt an ein einziges „Definitionsformat“ gebunden zu sein?

Wenn die Antwort auf die meisten Fragen „eher nein“ lautet, bauen Sie ein Schaufenster. Wenn sie „eher ja“ lautet, haben Sie bereits die Ansätze einer Repräsentanz.

## Schluss: Die menschliche Ebene stirbt nicht, sie übernimmt Verantwortung

Ich glaube nicht an die These „Websites werden verschwinden“. Und ich glaube auch nicht an das entgegengesetzte Extrem – dass es genügt, einen „agent-ready“ Aufsatz anzuschrauben und weiterzuarbeiten wie bisher. Beide Positionen vereinfachen die Realität.

Für mich sieht das Bild so aus. Die Website als menschliches Schaufenster verliert an Bedeutung als einziger Kanal des Geschäftsabschlusses, aber die Website als **prüfbare Repräsentanz** wird wichtiger. Und die menschliche Ebene ist weder Legacy noch Relikt. Vom Hauptkanal verschiebt sie sich an die Stellen, auf die man bei hohem Einsatz blickt, zum Sicherheitsnetz beim Ausfall des Agenten, zur menschenlesbaren Spur für Kunde, Regulator und Gericht. Gerade die Verlässlichkeit dieser Oberfläche macht die maschinellen Ebenen vertrauenswürdig genug, damit man sie nutzt.

Wenn man alles auf einen Gedanken reduzieren will: „Wer ein digitales Fundament und kein Schaufenster baut, baut bereits für Agenten.“ In einer Welt, in der Maschinen den Vergleich übernehmen, überlebt nicht die lauteste Seite, sondern die am besten prüfbare Repräsentanz.

---

Praktische Schlussfolgerung. Solange Agenten den Vergleich übernehmen, ergibt es Sinn, nicht in die Gestaltung des Schaufensters zu investieren, sondern in das, was eine Maschine prüfen kann: Identität, Herkunft, Rechenschaftspflicht und signierte Aussagen dort, wo sie Risiko oder Verantwortung tragen – projiziert aus **einer Quelle der Wahrheit** sowohl für den Menschen als auch für den Agenten. Bauen Sie korrekt: saubere Struktur, maschinenlesbare Fakten, davon getrennte prüfbare Garantien und menschliche Bestätigung dort, wo eine Handlung bindend oder irreversibel ist. Binden Sie Ihre Strategie nicht an ein konkretes Protokoll oder eine Plattform, wenn Sie ein langfristiges Unternehmen aufbauen.

Ich spreche hier von technischen Invarianten, nicht von rechtlicher Eindeutigkeit. Wie schnell KI-Agenten regionale Unternehmen erreichen werden, ist mir nicht bekannt. Die Frage, wer für den Fehler eines autonomen Agenten haftet, bleibt von der Jurisdiktion abhängig. Aber der architektonische Beitrag ist real: Eine Website kann Beweise erzeugen, auch wenn sie Streitigkeiten nicht entscheidet. Und genau diese Prüfbarkeit wird nach meiner Überzeugung den Wechsel der Interfaces überdauern.

## Prüfen Sie, ob Sie ein Schaufenster oder bereits eine Repräsentanz haben

Ich habe die Logik des Artikels in eine kurze Selbsteinschätzung verdichtet. In 3–5 Minuten sehen Sie, wo Ihre Website bereits robust gegenüber der agentischen Zukunft ist und wo sie ein fragiles Schaufenster bleibt: bei der Maschinenlesbarkeit von Fakten, der Prüfbarkeit von Vertrauen, der einheitlichen Quelle der Wahrheit, der menschlichen Bestätigung und der Abhängigkeit von Protokollen. Das ist weder ein Zertifikat noch ein Rechtsgutachten, sondern ein praktisches Profil architektonischer Risiken.

**Next step:** Selbsteinschätzung durchführen
