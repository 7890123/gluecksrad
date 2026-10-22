#!/bin/bash
# Einmalige Einrichtung des Glücksrads auf dem Server (rootful Podman + Quadlet + Auto-Update).
# Aufruf:  sudo bash setup-server.sh  [alter-data-ordner]
set -euo pipefail

OLD_DATA="${1:-}"
DATA=/srv/gluecksrad/data
RAW=https://raw.githubusercontent.com/7890123/gluecksrad/main/deploy

[ "$(id -u)" = 0 ] || { echo "Bitte mit sudo ausführen: sudo bash $0"; exit 1; }
command -v podman >/dev/null || { echo "podman ist nicht installiert"; exit 1; }

PV=$(podman version --format '{{.Client.Version}}' 2>/dev/null || podman --version | awk '{print $3}')
echo "Podman $PV"
if [ "$(printf '%s\n4.4\n' "$PV" | sort -V | head -1)" != "4.4" ]; then
  echo "FEHLER: Quadlet braucht Podman >= 4.4 (installiert: $PV)"; exit 1
fi

echo "1) Alte Container entfernen"
podman rm -f gluecksrad gluecksrad-v2 >/dev/null 2>&1 || true
for u in $(awk -F: '$3>=1000 && $3<65000 {print $1}' /etc/passwd); do
  runuser -u "$u" -- podman rm -f gluecksrad gluecksrad-v2 >/dev/null 2>&1 || true
done

echo "2) Daten nach $DATA"
mkdir -p "$DATA"
if [ -f "$DATA/gluecksrad.db" ]; then
  echo "   $DATA/gluecksrad.db existiert schon – wird nicht überschrieben"
else
  if [ -z "$OLD_DATA" ]; then
    # bisherige Datenbank suchen (neueste zuerst)
    OLD_DB=$(find / -xdev \( -path /proc -o -path /sys -o -path "$DATA" \) -prune -o \
             -name gluecksrad.db -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    [ -n "$OLD_DB" ] && OLD_DATA=$(dirname "$OLD_DB")
  fi
fi
if [ -f "$DATA/gluecksrad.db" ]; then
  :
elif [ -n "$OLD_DATA" ] && [ -d "$OLD_DATA" ]; then
  cp -a "$OLD_DATA"/. "$DATA"/ && echo "   übernommen aus $OLD_DATA"
else
  echo "   kein alter Datenordner gefunden – starte mit leerer Datenbank"
fi

echo "3) Dienst einrichten"
mkdir -p /etc/containers/systemd
curl -fsSL "$RAW/gluecksrad.container" -o /etc/containers/systemd/gluecksrad.container
mkdir -p /etc/systemd/system/podman-auto-update.timer.d
printf '[Timer]\nOnCalendar=\nOnCalendar=*:0/15\nRandomizedDelaySec=60\n' \
  > /etc/systemd/system/podman-auto-update.timer.d/override.conf
systemctl daemon-reload
if ! systemctl cat gluecksrad.service >/dev/null 2>&1; then
  echo "FEHLER: systemd kennt gluecksrad.service nicht. Quadlet-Prüfung:"
  /usr/libexec/podman/quadlet -dryrun 2>&1 | tail -20 || true
  exit 1
fi

echo "4) Image laden und starten (beim ersten Mal ca. 1 Minute)"
podman pull -q ghcr.io/7890123/gluecksrad:latest >/dev/null
if ! systemctl restart gluecksrad; then
  echo; echo "Start fehlgeschlagen. Diagnose:"
  echo "--- Port 8080 belegt von:"; ss -tlnp 2>/dev/null | grep ':8080 ' || echo "(frei)"
  echo "--- Logs:"; journalctl -u gluecksrad -n 40 --no-pager
  exit 1
fi
systemctl enable --now podman-auto-update.timer >/dev/null

echo -n "5) Warte auf die App "
for i in $(seq 1 30); do
  if curl -fs -o /dev/null http://localhost:8080/api/auth/status; then
    echo " – läuft!"
    echo
    echo "Fertig: http://$(hostname -I | awk '{print $1}'):8080"
    systemctl list-timers podman-auto-update.timer --no-pager | head -2
    exit 0
  fi
  echo -n "."; sleep 2
done
echo
echo "App antwortet nicht. Letzte Logs:"
journalctl -u gluecksrad -n 30 --no-pager
exit 1
