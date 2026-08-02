# Beiträge leisten

> [English Version](CONTRIBUTING.en.md)

Danke, dass Sie zum Handwerk Digital Readiness Index (HDRI) beitragen möchten. Beiträge sind auf allen Ebenen willkommen — von der Korrektur eines Rechtschreibfehlers bis zur Integration einer neuen Datenquelle.

## Wie kann ich beitragen?

### 1. Fehler melden oder Verbesserung vorschlagen

- Öffnen Sie ein [GitHub Issue](https://github.com/syrokomskyi/hdri/issues).
- Beschreiben Sie das Problem so präzise wie möglich. Bei Fehlern: Schritte zur Reproduktion, erwartetes vs. tatsächliches Verhalten, Umgebung (Node.js-Version, Betriebssystem).
- Bei Methodik-Vorschlägen: Fügen Sie wissenschaftliche Referenzen oder Rechtsgrundlagen bei.

Bitte lesen Sie vor einem Beitrag die [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

### 2. Code-Beitrag (Pull Request)

1. **Forken** Sie das Repository.
2. **Erstellen Sie einen Branch** für Ihre Änderung: `git checkout -b feature/ihre-beschreibung`.
3. **Ändern Sie** den Code. Halten Sie sich an die bestehende Architektur:
   - Neue Gogols in `apps/<app>/run/gogols/`
   - Gemeinsame Logik in `packages/*`
   - Keine Abhängigkeiten außerhalb des Monorepos ohne vorherige Absprache
4. **Testen Sie** Ihre Änderung:
   ```bash
   pnpm turbo run typecheck
   pnpm turbo run build
   ```
5. **Committen Sie** mit einer beschreibenden Nachricht auf Deutsch oder Englisch.
6. **Erstellen Sie einen Pull Request** mit:
   - Beschreibung der Änderung
   - Begründung (warum notwendig)
   - Tests, die Sie ausgeführt haben

### 3. Übersetzung

Die Dokumentation soll auf Deutsch und Englisch vorliegen. Wenn Sie eine Übersetzung beisteuern:

- Erstellen Sie `.en.md`-Dateien parallel zu existierenden `.md`-Dateien.
- Fügen Sie in beide Dateien einen Sprachwechsler-Link hinzu (siehe bestehende READMEs als Vorlage).
- Übersetzen Sie nicht maschinengenerierte YAML/JSON-Beispiele — behalten Sie deutsche Fachterminologie bei.

### 4. Neue Datenquelle vorschlagen

Wenn Sie einen neuen Katalog (CSV, HTML) für die Factory-Pipeline beisteuern möchten:

- Öffnen Sie ein Issue mit:
  - Name und Herkunft der Quelle
  - Datenschutzhinweis (enthält die Quelle personenbezogene Daten?)
  - Beispiel-Datensatz (5–10 anonymisierte Zeilen)
  - Lizenz oder Nutzungsbedingungen der Quelle
- Wir prüfen, ob die Quelle in die bestehende Pipeline integriert werden kann.

## Code-Stil

- TypeScript, strikte Prüfung
- 2 Leerzeichen Einrückung
- `??` statt `||` für Nullish-Coalescing
- `satisfies` für Konfigurationen und Konstanten
- `override` bei Klassenvererbung
- Kommentare nur dort, wo die Erklärung die Wartbarkeit verbessert

## Lizenz

Durch das Einreichen eines Beitrags stimmen Sie zu, dass Ihr Beitrag unter der [Apache License 2.0](LICENSE) veröffentlicht wird.
