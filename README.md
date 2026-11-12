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
- **Saison-Themes** (Button ✨/🎃/🎄/🐰 im Menü, pro Benutzer gespeichert): Halloween (Kürbis-Nabe, Hexenhut, Spinnennetze,
  Fledermäuse, Gruselsounds) und Weihnachten (Christbaumkugel, Weihnachtsmütze, Schneefall beim Drehen, Jingle Bells) und Ostern (bemaltes Ei, Hasenohren, hoppelnder Osterhase,
  versteckte Ostereier zum Suchen, Marimba & Vogelgezwitscher).
- **Als App installierbar (PWA)**: unter HTTPS in Chrome/Android „App installieren“ (oder Button 📲 im Menü),
  iPhone: Teilen → „Zum Home-Bildschirm“. Eigenes Icon, Vollbild, Handy-Layout mit Menü ☰.
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
  - **≥ 70 %** → der gezogene Eintrag fliegt raus (ein Eintrag weniger). War es der letzte, pausiert die/der Schüler/in
    **3 Wochen** in diesem Fach (⏸ in der Namensliste) und kommt danach automatisch wieder **einmal** ins Rad.
    „+“ oder „Zurücksetzen“ beenden die Pause sofort.
  - **50–69 %** → bleibt
  - **< 50 %** → zusätzlicher Eintrag an zufälliger Position
- **Joker 🃏** (pro Fach): Jede Lehrkraft der Klasse vergibt Joker im Tab Schülerliste – „Allen +1 Joker“ für das
  gewählte Fach oder − / + je Name. Administrator/innen können zusätzlich allen Schüler/innen aller Klassen in jedem Fach
  einen Joker geben (👥 Benutzerverwaltung). Eingesetzt wird ein Joker über 🃏 in der Namensliste oder direkt im
  Bewertungsdialog nach der Ziehung oder in der Spalte „Heute“: die/der Schüler/in ist für den restlichen Tag nicht im Rad dieses Fachs, die Einträge
  bleiben erhalten. Versehentlich eingesetzt → nochmal klicken zum Zurücknehmen.
- **Pro Tag nur einmal dran** (pro Fach): wer bewertet wurde, ist für den restlichen Tag nicht mehr im Rad dieses Fachs
  („✓ gezogen“); die Einträge bleiben, am nächsten Tag ist sie/er wieder dabei. „Überspringen“ zählt nicht.
- **Spalte „Heute“** in der Namensliste: *abwesend* oder *schon dran* (außerhalb des Rads) nimmt jemanden für heute aus
  dem Rad, ebenso ein 🃏 Joker. Zurück auf „–“ holt die Person heute wieder ins Rad.
  *Abwesend* wird im Verlauf mit Datum protokolliert (Statistik „Abwesend“, auch pro Schüler/in filterbar).
- **🗂️ Karteikarte** (Knopf neben „Drehen“, pro Fach im Browser gemerkt): statt des Glücksrads wird eine Karte aus
  dem Stapel gezogen – gleiche Gewichtung (Anzahl der Einträge), Turbo beschleunigt auch das Blättern.
- **⚡ Turbo-Modus** (Knopf neben „Drehen“, pro Fach): Rad und Töne laufen 5× schneller, nach der Ziehung erscheint eine
  Frage aus dem **Fragenpool** des Fachs (Tab „Fragen“: eine Zeile pro Frage, neue unten anhängen) – der Reihe nach,
  „andere Frage ↻“ springt eine weiter. Bewertung im Turbo: **≥ 90 %** −1 Eintrag, **30–89 %** bleibt, **< 30 %** +1.
  Ab 50 % zählt die Frage als richtig; nach 3 richtigen Antworten wird sie inaktiv und kommt ins **Archiv**
  (wird nicht gelöscht, im Tab „Fragen“ unter „📦 Archiv“ jederzeit reaktivierbar).
  Im Bewertungsdialog erscheint die Frage erst **10 Sekunden nach dem Ziehen** (Countdown, „jetzt zeigen“ deckt sie
  sofort auf; wird vorher gespeichert, zählt die Frage nicht). Reihenfolge pro Fach umschaltbar: **der Reihe nach** oder
  **🎲 zufällig** (die zuletzt gestellte Frage kommt nicht gleich wieder).
  **⬜ ITAC A Mode** (Knopf im Fragenfeld, pro Browser gemerkt): breiter Dialog mit großer weißer Fläche unter der
  Frage – frei für Zeichnungen an der Tafel; die Bewertung liegt darunter.
  Jede Frage kommt **höchstens einmal pro Tag** dran (im Tab „Fragen“ mit „heute ✓“ markiert).
  **📋 Alle kopieren** kopiert alle Fragen des Fachs (Pool, dann Archiv) im Eingabeformat – eine Zeile pro Frage.
  YAML-Einzeiler in Fragen (z. B. `services: { plex: { image: …, volumes: [ … ] } }`) werden als eingerückter
  YAML-Block angezeigt; gespeichert und kopiert wird der Originaltext.
  „Pro Tag nur einmal dran“ gilt auch im Turbo.
- **Fragen im normalen Modus:** Fragen mit **(2P)** oder **(3P)** im Text kommen im normalen Modus dran (ebenfalls der
  Reihe nach, eigener Zähler), alle anderen nur im Turbo. Ohne solche Fragen erscheint im normalen Modus keine Frage.
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
