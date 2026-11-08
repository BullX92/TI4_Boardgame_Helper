# Pixel-Querformat: Layout und Regression

## Verhalten

Ab 800 CSS-Pixeln im Querformat bindet sich die Spieloberfläche an `100dvh` (Safe Areas inklusive). Header, Spieleridentität und kompakter Footer bleiben feste Zeilen; das zweispaltige Spielfeld erhält die verbleibende Höhe. Alle acht Strategiezeilen teilen diese Resthöhe. Die Bildschirm-Wachhaltefunktion sitzt im Header statt in einer zusätzlichen 44-Pixel-Footerzeile.

Die Zugaktionen behalten mindestens 44 Pixel Höhe. Der Draft verwendet vier Spalten, zwei Kartenreihen und einen Startknopf neben dem Draftkopf. Das holografische Rad nutzt die verbleibende Höhe; zuerst schrumpft die dekorative Grafik. Tiefe 1.3, Dauer 1800, Glow 0.35 und Originalfarben 80 bleiben unverändert. Status-Checkliste und Rundenfortschritt stehen nebeneinander.

**Bewusste innere Scrollbereiche:** Namen/Farben beim Erstellen, aufgeklappter Beitritt, Sitzwahl, Setup-Sitzliste und bei Bedarf Einladungsinformationen, vollständige Rad-Spielerliste sowie Tools-Inhalte. Setup-Bereit/Start und Erstellen bleiben außerhalb ihrer langen Listen. Tools-Schließen liegt außerhalb des Inhalts-Scrollers. Diese Listen sind keine Behauptung, acht vollständige Formulare gleichzeitig anzeigen zu können. Im Hochformat darf die Seite vertikal scrollen. Bei fokussierten Formularfeldern und einer Tastatur-Resthöhe unter 280 Pixeln wird das Erstellformular wieder dokument-scrollbar.

## Test

`scripts/verify_pixel_landscape.cjs` verwendet echtes mobiles Chromium mit Touch und DPR 2.625. Es akzeptiert ausschließlich `http://127.0.0.1:18094` bzw. `http://localhost:18094`; API-Zugriffe sind zusätzlich auf in diesem Lauf erzeugte Sitzungen beschränkt. Keine vorhandene Sitzung wird ausgewählt. Wichtig: Fixtures müssen exakt `Table Prototype` heißen, weil der Server nur dafür die unabhängigen Secondary-Workflows aktiviert.

Getestet werden 3/8 Spieler, Erstellung mit 6/8 Namensfeldern, Beitritt/Sitzwahl, Setup, eigener/wartender Draft, Aktion mit 1/2 Karten, primäre Aktion, Politics-Sprecherwahl, ausstehende/verfolgte/erledigte Secondary, Warten/Passen, alle Statusstufen, nächste Runde und Tools/Zeiten/Admin/Roster. Viewports: 915×412/360/320, 800×360, 1440×900, 2400×1080, Hochformat 412×915; anschließend dieselbe Sitzung wieder 915×320→412. Sichtbare Controls werden inklusive deaktivierter Controls auf 44×44, Viewport, beschneidende Vorfahren und `elementFromPoint` an drei Punkten geprüft. Innere Listen müssen jeden Eintrag tatsächlich erreichbar machen. Geschlossene Details werden nicht als sichtbare Controls gezählt. JSON und Screenshots werden geschrieben; Assertion- oder Laufzeitfehler ergeben Exit 1.

Lokaler Aufruf mit bereits verfügbarem Playwright/Browser (keine Installation):

```sh
TI4_BASE_URL=http://127.0.0.1:18094 \
TI4_EVIDENCE_DIR=output/playwright \
PLAYWRIGHT_PACKAGE=/pfad/zum/vorhandenen/playwright \
node scripts/verify_pixel_landscape.cjs
```

`PLAYWRIGHT_CHANNEL` ist optional; ohne Channel verwendet der neue Runner den passenden Playwright-Browser, nicht einen vorausgesetzten System-Chrome. `scripts/verify_compact_ui.js` bleibt separat verwendbar; seine Animationsprüfung berücksichtigt die korrekte verbleibende CSS-Transitionsdauer nach einem Reflow.

Vorhandener isolierter Host-Runner (nach separat freigegebenem Candidate-Build/Quell-Sync durch den Parent):

```sh
ssh -i /root/.ssh/id_ed25519 jakob@192.168.0.69 \
'docker run --rm --network host --read-only --tmpfs /tmp:rw,nosuid,size=256m \
 --shm-size=256m --cap-drop ALL --cap-add DAC_OVERRIDE \
 --security-opt no-new-privileges --volumes-from hermes:ro \
 --mount type=bind,src=/data/docker/compose/hermes/data/work/boardgame-pixel-ui/output,dst=/evidence \
 --entrypoint node local/hermes-agent:0.21.5-sec20261101 \
 /opt/data/work/boardgame-pixel-ui/scripts/verify_pixel_landscape.cjs'
```

## Finale Freigabe und Live-Nachweis

- Finale `pixel-landscape-v6`: **296 vollständige Pixel-Fälle, 0 Layoutfehler, 0 Laufzeitfehler, leeres Netzwerkfehlerprotokoll**; Bericht `output/candidate-v6-verification.json`.
- Sichtbare Links werden wie Buttons auf 44×44 geprüft, einschließlich Einladungslinks in Setup und Sitzwahl. Netzwerkfehler oder unvollständige Fallzahl lassen den Runner fehlschlagen.
- `verify_wheel_resize_browser.cjs` prüft echte Chromium-CSS-Transitions: nach ca. 850ms Reflow nur die verbleibende Dauer, Abschluss am ursprünglichen Deadline. Die Legacy-Prüfung erlaubt deshalb eine verkürzte Restdauer bei unveränderter 1800ms-Konfiguration.
- Legacy Chromium: **25 Layoutprüfungen, 0 Fehler**; Python-Flow- und Parallel-Undo-Suiten erfolgreich. `verify_wheel_resize.cjs` ebenfalls grün.
- Live-Image-ID `sha256:66752f229be6abe7a1ebb0f3b96aae798e0d7baff1b82fccdf46468c89d5f2b5`. Produktiv `/api/version`: `4111366-pixel-landscape-v6`; beide Compose-Dienste healthy.
- Gesamtes Datenvolume vor dem Austausch gesichert: `/data/docker/compose/ti4-boardgame-helper/backups/before-pixel-ui-20261107T132242Z/ti4-data.tar.gz`. Archiv vollständig lesend validiert; Rollout-Audit im selben Ordner.
- Session FS5EQ nach Rollout vollständig identisch, dieselben 3 Spieler. Read-only Live-Browser-Smoke bei 915×412/DPR2.625: Dokument 915×412, keine Browserfehler, Session nach Seitenaufruf unverändert.
- LAN-Zugriff erfolgreich; fremdes Docker-Netz und gefälschte LAN-Forwarding-Header weiterhin HTTP403. Gateway wurde nicht ersetzt.

## Frühere Verifikationsstände

- Tests zuerst gegen unverändertes isoliertes Staging ausgeführt: der erste Runner zeigte tatsächlichen RED (101 Fälle, Exit 1; u.a. 1022 Pixel hohe Erstellung und 412 Pixel hohe Aktion bei 915×320).
- Erweiterter Runner: **290 Fälle, 196 Layoutfehler, keine Laufzeitfehler**, vollständig einschließlich Politics/Secondaries/Status/Tools gegen das alte Staging ausgeführt. Ein Fixture-Fehler (abweichender Sitzungsname) und GET-per-ID statt GET-per-Code wurden dabei korrigiert.
- Letzter Lauf nach zusätzlichem Next-round- und Karteninhalt-Hit-Test: **166 Fälle, 119 Layoutfehler**, dann infrastruktureller Abbruch beim Laden von `/_framework/dotnet.native.js` (Failed to fetch dynamically imported module), während des zweiten Fixtures. Aktuelles JSON: `output/pixel-landscape-red.json`; Host-Screenshots und Log liegen im isolierten `output`.
- `node --check scripts/verify_pixel_landscape.cjs` und `git diff --check` erfolgreich.
- Candidate `pixel-landscape-v4`: vollständiger Lauf mit **296 Fällen, 0 Layoutfehlern, 0 Laufzeit- oder Netzwerkfehlern**. Bericht: `output/candidate-v4-verification.json`. Ein voriger Lauf brach beim dynamischen .NET-Import ab; der vollständige Wiederholungslauf mit Request-Fehlerprotokollierung war fehlerfrei. Eine Ursache dieses sporadischen Ladeabbruchs ist nicht bewiesen.
- Bestehender Chromium-UI-Runner: **25 Layoutprüfungen, 0 Fehler**, inklusive Tools, Fokus, Drei-Geräte-Zugsynchronisierung, Secondaries und Undo. Beide Python-Flow-/Parallel-Undo-Suiten erfolgreich.
- `node scripts/verify_wheel_resize.cjs`: Regression zuerst RED, nach Fix GREEN. ResizeObserver zeichnet die laufende Animation mit ihren Übergangsrängen neu, ohne deren Deadline zu löschen oder sie bei Duplicate-Refresh erneut zu starten.
- Auf OMV separat gebaut und ausschließlich gegen isolierten Testcontainer auf Loopback-Port 18094 geprüft. Produktionsrollout und Spielstandvergleich werden separat im Deployment-Audit dokumentiert.
