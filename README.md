# TI4 Boardgame Helper

Eine kompakte Tischbegleitung für **Twilight Imperium 4**, optimiert für Smartphones im Querformat und **2400 × 1080 Pixel**. Die Oberfläche ist auf Englisch.

- Gemeinsame Sitzung für 3–8 Spieler mit Einladungslink und QR-Code.
- Fraktionsauswahl, Strategieauswahl, aktive Spieler und Zugzeiten in Echtzeit.
- Holografisches Initiativrad: aktiver Spieler groß, nächste Spieler gestaffelt; Tiefenstaffelung **1,3**, Zugwechsel **1800 ms**, Leuchten **0,35**, Originalfarben **80 %**.
- Sofortige **Follow / Skip**-Abfrage beim Ausspielen einer SC, unabhängig vom Abschluss der Primary.
- **Undo** für die letzte eigene Aktion des aktiven Spielers im aktuellen Zug, mit Bestätigung und Schutz fremder Antworten.
- Ausklappbare linke Werkzeugleiste für **Player times** und **Admin**.

## Auf OMV starten

In OMV Compose eine neue Datei anlegen und den Inhalt von **[compose.yaml](compose.yaml)** einfügen. Der Stack lädt das fertige öffentliche Image; auf OMV ist weder Git noch .NET erforderlich.

Nach dem Start: **`http://DEINE-OMV-IP:8092`**. `/` führt direkt zur Tischansicht `/table`.

Alternativ per SSH:

```sh
mkdir -p ~/ti4-boardgame-helper
cd ~/ti4-boardgame-helper
curl -fsSL https://raw.githubusercontent.com/BullX92/TI4_Boardgame_Helper/main/compose.yaml -o compose.yaml
docker compose pull
docker compose up -d
docker compose ps
curl -fsS http://localhost:8092/health
```

Spielstände, Zugzeiten, Undo-Verlauf und Referenzdaten liegen dauerhaft im Volume `ti4_data`. Ein Container-Update erhält sie. Die lokale Entwicklungsdatenbank wird weder veröffentlicht noch ins Image kopiert.

**[OMV, Updates, Sicherung und spätere Domain → DEPLOY.md](DEPLOY.md)**

## Spielen

1. Auf jedem Smartphone dieselbe Serveradresse öffnen. Der Host erstellt die Sitzung und verteilt den Einladungslink.
2. Jeder Spieler wählt seinen Namen, seine Fraktion und **I am ready**.
3. Der Host startet die Strategiephase. Nach der vollständigen Kartenwahl beginnt die Aktionsphase.
4. **Play SC** öffnet gleichzeitig die Primary beim Besitzer und Follow / Skip bei den übrigen Spielern. **End turn** wird verfügbar, sobald beide abgeschlossen sind.
5. Der Pfeil **↶** neben der Zugzeit nimmt nach Bestätigung die letzte eigene Aktion zurück, soweit dabei keine fremden Entscheidungen überschrieben werden.

Die Spieleingaben bleiben serverseitig gespeichert. Ein Browser behält seine Geräteidentität lokal; jeder Spieler sollte deshalb seinen eigenen Browser verwenden. Neue Geräte erhalten keine bereits belegten Sitze ohne Freigabe durch den Host.

## Lokal entwickeln

.NET 10 SDK installieren, dann unter Windows `./Start-Prototype.ps1` aufrufen. Alternativ:

```sh
cd Ti4Companion.ApiService
dotnet run --no-launch-profile --urls http://localhost:5116
```

`/prototype.html` bietet drei simulierte Spieleransichten mit getrennten Geräteidentitäten. [Details und bisherige Prüfungen](docs/DEVELOPMENT.md).

Die HTTP-Prüfungen legen ausschließlich neue Testsitzungen an:

```sh
python scripts/verify_table_flow.py
python scripts/verify_parallel_undo.py
```

Mit `TI4_BASE_URL` lässt sich eine andere Testinstanz auswählen. Für Browserprüfungen: Playwright und die gewünschten Browser installieren, danach `node scripts/run_ui_checks.cjs playwright chromium` beziehungsweise `webkit`. Ergebnisse werden lokal unter `artifacts/` und `output/` gespeichert.

## Herkunft und Lizenz

Auf Basis von **[ArcticArt/ti4companion](https://github.com/ArcticArt/ti4companion)**; dessen Git-Historie und [MIT-Lizenz](LICENSE) bleiben erhalten. Die ursprüngliche Dokumentation liegt in [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md). Die bestehende .NET-/Blazor-/SignalR-Anwendung übernimmt weiterhin Regeln, Berechtigungen und SQLite-Speicherung.

Die MIT-Lizenz betrifft den Quellcode. Twilight Imperium, Fraktionsbilder und andere Spielinhalte gehören ihren jeweiligen Rechteinhabern; siehe [Drittanbieterhinweise](THIRD-PARTY-NOTICES.md).
