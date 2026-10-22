#!/bin/sh
# Startet als root, macht den Datenordner für den App-Benutzer beschreibbar
# und startet den Server dann ohne root-Rechte.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  chown -R app:app "${DATA_DIR:-/data}" || echo "WARNUNG: konnte Besitzer von ${DATA_DIR:-/data} nicht ändern"
  exec setpriv --reuid=app --regid=app --init-groups python /app/server.py
fi
exec python /app/server.py
