#!/usr/bin/env bash
# Fallback: stops the Kip server using its PID file when the UI button isn't reachable.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
PIDFILE="data/kip.pid"
[ -f "$PIDFILE" ] || { echo "Kip is not running (no $PIDFILE)."; exit 0; }
PID="$(tr -d '\r\n ' < "$PIDFILE")"
if is_windows; then taskkill //F //PID "$PID" >/dev/null 2>&1 || echo "Process $PID not found."
else kill "$PID" 2>/dev/null || echo "Process $PID not found."; fi
rm -f "$PIDFILE"
echo "Kip stopped."
