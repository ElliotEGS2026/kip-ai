#!/usr/bin/env bash
# Shared helpers. Works on Linux, macOS and Git Bash (Windows).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

is_windows() { case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac; }

kip_port() {
  local p="${KIP_PORT:-}"
  [ -z "$p" ] && [ -f .env ] && p="$(grep -E '^KIP_PORT=' .env | tail -1 | cut -d= -f2 | tr -d '\r ')"
  echo "${p:-47821}"
}

open_browser() {
  [ -n "${KIP_NO_BROWSER:-}" ] && return 0
  if is_windows; then cmd.exe //c start "" "$1" >/dev/null 2>&1
  elif [ "$(uname -s)" = "Darwin" ]; then open "$1"
  else xdg-open "$1" >/dev/null 2>&1 || echo "Open $1 in your browser"; fi
}
