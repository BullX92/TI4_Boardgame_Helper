# OMV-Betrieb

## Installation mit OMV Compose

1. Unter **Dienste → Compose → Dateien** einen Stack namens `ti4-boardgame-helper` anlegen.
2. [compose.yaml](compose.yaml) vollständig in das YAML-Feld kopieren, speichern, Image laden und den Stack starten.
3. `http://DEINE-OMV-IP:8092` öffnen. Auf Jakobs aktuellem LAN ist das `http://192.168.0.69:8092`.

Das öffentliche Image `ghcr.io/bullx92/ti4_boardgame_helper:latest` benötigt keine Registry-Anmeldung. Port **8092** ist der Webseiten-Port; im Container läuft die App auf **8080**. Andere Dienste benötigen keine Änderung. In einer OMV-Umgebungsdatei kann `TI4_PORT=8093` den Host-Port ändern. `TI4_BIND_ADDRESS` begrenzt bei Bedarf die veröffentlichte Netzwerkschnittstelle.

Der Container läuft als unprivilegierter Benutzer (UID **1654**). Das benannte Volume wird mit den passenden Rechten erstellt; keine PUID-/PGID-Einstellung nötig. Bei einem eigenen Bind-Mount muss dessen Verzeichnis für UID 1654 schreibbar sein.

## Daten und Neustarts

Das Volume `ti4_data` wird im Container unter `/data` eingebunden. Compose setzt ihm den Projektnamen voran, üblicherweise `ti4-boardgame-helper_ti4_data`. Beim erstmaligen Start werden die Referenzdaten aus dem Image übernommen und Datenbankschemata automatisch angelegt. Vorhandene Daten werden bei Updates erhalten.

- `ti4.db`: Sitzungen, Spieler, Zeiten, Undo-Verlauf und Gerätezuordnung.
- `ti4master.db`: Fraktionen, Karten und sonstige Referenzdaten.
- SQLite legt bei Bedarf `-wal` und `-shm` an; auch diese liegen im Volume.

Die bisherige lokale Spielsitzung wird nicht automatisch auf OMV übertragen. Auf OMV beginnt eine neue Installation. Browseridentitäten gehören zur jeweiligen Adresse; ein späterer Domainwechsel kann deshalb eine erneute Sitzzuordnung durch den Host erfordern.

## Aktualisieren und prüfen

Jeder Push nach `main` erstellt über GitHub Actions ein neues Image. Warten, bis **Build and publish Docker image** erfolgreich beendet ist, dann in OMV Image neu laden und den Stack neu erstellen. Per SSH im Compose-Verzeichnis:

```sh
docker compose pull
docker compose up -d
docker compose ps
curl -fsS http://localhost:8092/health
curl -fsS http://localhost:8092/api/version
```

`/health` liefert **Healthy**. `/api/version` nennt den Git-Commit des laufenden Images. `restart: unless-stopped` startet die App nach einem Serverneustart wieder. Browser gegebenenfalls über den angebotenen Update-Hinweis neu laden.

Für eine feste Version statt `latest` den vollständigen Commit-SHA als Image-Tag verwenden. Spielstände erhalten sich bei einem normalen Update; ein Rücksprung zu älteren Datenbankschemata benötigt gegebenenfalls die zugehörige Sicherung.

## Sicherung

Vor einer Dateisicherung den Container kurz stoppen, damit beide SQLite-Dateien konsistent sind. Im Verzeichnis der Compose-Datei ausführen:

```sh
docker compose stop web
docker compose run --rm --no-deps --user 0 --entrypoint tar web -C /data -czf - . > ti4-data-backup.tar.gz
docker compose start web
```

Die Sicherung enthält auch Gerätezuordnungen und sollte privat aufbewahrt werden. Zum Wiederherstellen den Stack stoppen und die Sicherung in dasselbe Volume zurückspielen; anschließend Dateirechte für UID 1654 herstellen. **`docker compose down -v` löscht das Datenvolume** und ist kein Update-Schritt.

## Später eine Domain anschließen

Die App benötigt keine fest eingebaute Domain. Für den bereits vorhandenen **Nginx Proxy Manager**:

1. DNS der gewünschten Domain auf den öffentlich erreichbaren Anschluss beziehungsweise den verwendeten Tunnel richten.
2. Einen Proxy Host erstellen: Domain eintragen, Schema **http**, Forward Host **192.168.0.69**, Forward Port **8092**.
3. **Websockets Support** aktivieren, damit SignalR die Spieleransichten unmittelbar synchronisiert.
4. Ein TLS-Zertifikat einrichten und **Force SSL** aktivieren. Bei direkter Erreichbarkeit müssen die externen Ports 80/443 zum Proxy führen; für andere Zugangswege deren TLS-Verfahren verwenden.
5. Wenn der Proxy eingerichtet ist, dessen tatsächliche Quell-IP für weitergereichte Client-Adressen freigeben. Unter `environment` des Webcontainers ergänzen und den Stack neu erstellen:

```yaml
      ReverseProxy__KnownProxies__0: "TATSAECHLICHE-PROXY-IP"
```

Gemeint ist die Adresse, die der Webcontainer als Proxy sieht, beispielsweise die interne Docker-IP des Nginx Proxy Managers. Ohne diese Einstellung funktioniert der Webzugriff, aber die Rate-Limits zählen Anfragen hinter dem Proxy gemeinsam. Nur den konkreten eigenen Proxy freigeben, keine pauschale Weiterleitung aller Forwarded-Header.

Danach `https://DEINE-DOMAIN/table` verwenden. Die App läuft unverändert auf HTTP im Container; TLS endet am Proxy. Auf Smartphones benötigen Wake Lock, Kamera und PWA-Funktionen einen sicheren Browserkontext; auf einer einfachen LAN-HTTP-Adresse sind sie je nach Browser eingeschränkt. Die Tischansicht und Eingaben funktionieren über HTTP.

Microsoft-Dokumentation: [ASP.NET Core im Container](https://learn.microsoft.com/aspnet/core/host-and-deploy/docker/building-net-docker-images), [Reverse Proxy und Forwarded Headers](https://learn.microsoft.com/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0).

## Optional selbst bauen

```sh
git clone https://github.com/BullX92/TI4_Boardgame_Helper.git
cd TI4_Boardgame_Helper
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Die Vorlage baut für die Architektur des Docker-Hosts. Das vorgefertigte Image ist für **linux/amd64**, passend zu Jakobs OMV-Server.
