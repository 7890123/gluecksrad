# Glücksrad für Schulklassen – v2

## Starten

    docker compose up -d --build

Dann im Browser: http://localhost:8080
Beim ersten Aufruf legst du das **Administrator-Konto** an (oder per `ADMIN_USER`/`ADMIN_PASSWORD` in `docker-compose.yml`).

Stoppen: `docker compose down` – die Daten bleiben in `./data/gluecksrad.db` (SQLite-Datei, Standard-SQL).
Backup = diese Datei kopieren (am besten bei gestopptem Container).

## Mit Podman (ohne Docker)

    sudo chown -R $USER: data            # nur falls data root gehört
    podman build --format docker -t gluecksrad .
    podman run -d --name gluecksrad -p 8080:8080 -v ./data:/data:Z gluecksrad

Oder mit Compose: `sudo dnf install podman-compose` und dann `podman compose up -d --build`.

Autostart (rootless, per systemd/Quadlet): siehe deploy/SERVER-SETUP.md (automatische Updates aus GitHub)

Alt (lokal gebaut):

    mkdir -p ~/.config/containers/systemd
    cp deploy/gluecksrad.container ~/.config/containers/systemd/   # Image= und Volume= anpassen
    systemctl --user daemon-reload
    systemctl --user start gluecksrad
    loginctl enable-linger $USER         # läuft auch ohne Anmeldung / nach Neustart

Update: `podman build --format docker -t gluecksrad .` und `systemctl --user restart gluecksrad`.

## Funktionen
- **Benutzerverwaltung**: Anmeldung mit Passwort (PBKDF2-Hash, HttpOnly-Session-Cookie, Sperre nach 5 Fehlversuchen für 1 Minute).
  Rollen *Administrator/in* (verwaltet Benutzer) und *Lehrkraft*. Jede/r sieht nur die eigenen Klassen. Passwort selbst ändern über 🔑.
- **Teamteaching**: Klassen über „👥 Team“ mit anderen Lehrkräften teilen – alle im Team bearbeiten dieselbe Klasse
  (Schülerliste, Fächer, Rad, Verlauf). Nur die Besitzerin/der Besitzer kann teilen, entfernen, übergeben und löschen;
  Team-Lehrkräfte können die Klasse verlassen. Beim Löschen eines Benutzers gehen geteilte Klassen an das Team über.
- Klassen und Schülerlisten verwalten (Namen zeilenweise einfügen, auch aus Excel)
- **Fächer pro Klasse**: jedes Fach hat ein eigenes Rad und einen eigenen Verlauf; die Schülerliste gilt für alle Fächer.
  Bestehende Daten landen beim Update im Fach „Allgemein“.
- Glücksrad mit Spannung: jede Drehung endet zufällig auf eine von vier Arten
  (langsames Kriechen · stockend · „fast stehen geblieben, dann noch ein Feld“ · über das Ziel hinaus und zurückpendeln)
- Soundeffekte – ein/aus über 🔊, Einstellungen über 🎵 (pro Benutzer gespeichert):
  Klick-Varianten (Ratsche, Holz, Spielshow, Sanft), Stillstand-Ton (Fanfare, Glocke, Applaus), Trommelwirbel, Lautstärke.
  **Eigene Audiodateien** (mp3/wav/ogg/m4a, max. 2 MB): kurze Datei = Klick pro Feld, längere Datei = läuft während der Drehung
  mit und wird beim Auslaufen langsamer/tiefer.
- 🎲 **Mischen**: würfelt die Reihenfolge im Rad durch
- Neue Namen und zusätzliche Einträge (Bewertung < 50 %, „+“) landen an **zufälliger Position**
- Bewertung nach der Ziehung:
  - **≥ 70 %** → der gezogene Eintrag fliegt raus
  - **50–69 %** → bleibt
  - **< 50 %** → zusätzlicher Eintrag an zufälliger Position
- Verlauf mit Statistik, Hell-/Dunkel-Modus, Tastatur: Leertaste = drehen, Enter = speichern, Pfeiltasten = Bewertung

## Fehler „attempt to write a readonly database“
Ab dieser Version korrigiert der Container die Rechte des Datenordners beim Start selbst.
Die Datenbank wird mit `:Z` eingebunden, damit es auch unter SELinux (Fedora/RHEL) funktioniert.
Falls es trotzdem auftritt: `sudo chown -R 1000:1000 data`, ggf. `sudo chcon -R -t container_file_t data`,
dann `docker compose up -d --build` (wichtig: `--build`, sonst läuft das alte Image weiter).

## Daten aus v1 übernehmen
`data.json` aus dem alten Volume in den Ordner `./data` kopieren – sie wird beim Start automatisch in die Datenbank
übernommen und dem ersten angelegten Benutzer zugeordnet.

## Ohne Docker
    cd app && DATA_DIR=../data python3 server.py
