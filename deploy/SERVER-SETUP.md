# Server einrichten (einmalig, im LXC als root)

Im eigenen LXC ist rootful Podman am einfachsten: kein Home-Verzeichnis, kein Linger,
und das Netzwerk läuft über netavark (kein pasta / /dev/net/tun nötig).

    sudo -i

    # 1) Alte Container stoppen (rootless + rootful)
    podman rm -f gluecksrad gluecksrad-v2 2>/dev/null

    # 2) Daten übernehmen
    mkdir -p /srv/gluecksrad/data
    cp -a /opt/wheel/glucksradv2/glucksradv2/data/. /srv/gluecksrad/data/

    # 3) Dienst einrichten
    mkdir -p /etc/containers/systemd
    curl -fsSL https://raw.githubusercontent.com/7890123/gluecksrad/main/deploy/gluecksrad.container \
      -o /etc/containers/systemd/gluecksrad.container
    systemctl daemon-reload
    systemctl start gluecksrad

    # 4) Automatische Updates alle 15 Minuten
    mkdir -p /etc/systemd/system/podman-auto-update.timer.d
    printf '[Timer]\nOnCalendar=\nOnCalendar=*:0/15\nRandomizedDelaySec=60\n' \
      > /etc/systemd/system/podman-auto-update.timer.d/override.conf
    systemctl daemon-reload
    systemctl enable --now podman-auto-update.timer

## Prüfen / Nützliches

    systemctl status gluecksrad --no-pager
    journalctl -u gluecksrad -n 50        # Logs
    podman auto-update --dry-run          # steht ein Update an?
    podman auto-update                    # sofort aktualisieren
    systemctl list-timers podman-auto-update.timer

Zurück auf eine bestimmte Version: in `/etc/containers/systemd/gluecksrad.container`
`Image=ghcr.io/7890123/gluecksrad:<commit-sha>` setzen, dann
`systemctl daemon-reload && systemctl restart gluecksrad`.
