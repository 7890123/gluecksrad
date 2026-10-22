# Server einrichten (einmalig, im LXC als normaler Benutzer)

    # 1) Daten übernehmen (bisheriger data-Ordner)
    mkdir -p ~/gluecksrad-data
    cp -a /opt/wheel/glucksradv2/glucksradv2/data/. ~/gluecksrad-data/

    # 2) Alten Container stoppen
    podman rm -f gluecksrad gluecksrad-v2 2>/dev/null
    systemctl --user disable --now gluecksrad 2>/dev/null

    # 3) Quadlet installieren (vorher <GITHUB-USER> eintragen)
    mkdir -p ~/.config/containers/systemd
    cp gluecksrad.container ~/.config/containers/systemd/
    systemctl --user daemon-reload
    systemctl --user start gluecksrad

    # 4) Automatische Updates alle 15 Minuten
    mkdir -p ~/.config/systemd/user/podman-auto-update.timer.d
    printf '[Timer]\nOnCalendar=\nOnCalendar=*:0/15\nRandomizedDelaySec=60\n' \
      > ~/.config/systemd/user/podman-auto-update.timer.d/override.conf
    systemctl --user daemon-reload
    systemctl --user enable --now podman-auto-update.timer

    # 5) Läuft auch ohne Anmeldung / nach Neustart
    loginctl enable-linger $USER

Nur bei privatem Image zusätzlich (Token mit Recht `read:packages`):

    podman login ghcr.io -u <GITHUB-USER>

## Nützlich

    podman auto-update --dry-run          # gibt es ein Update?
    podman auto-update                    # sofort aktualisieren
    journalctl --user -u gluecksrad -n 50 # Logs
    # Zurück auf eine bestimmte Version:
    #   Image=ghcr.io/<GITHUB-USER>/gluecksrad:<commit-sha> in der .container-Datei, dann
    #   systemctl --user daemon-reload && systemctl --user restart gluecksrad
