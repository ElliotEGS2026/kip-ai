#!/usr/bin/env bash
# Starts Kip: installs deps, generates today's brief if missing (or with --refresh), builds, serves, opens the browser.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

REFRESH=0
for a in "$@"; do
  case "$a" in
    --refresh) REFRESH=1 ;;
    -h|--help) echo "Usage: scripts/start.sh [--refresh]"; exit 0 ;;
    *) echo "Unknown option: $a"; exit 1 ;;
  esac
done

command -v node >/dev/null || { echo "Node 22+ is required: https://nodejs.org"; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || { echo "Node 22+ is required (found $(node -v))"; exit 1; }

[ -d node_modules ] || npm install --no-audit --no-fund
[ -f .env ] || cp .env.example .env
[ -d .git ] && git config core.hooksPath scripts/hooks || true

TODAY="$(date +%F)"
if [ "$REFRESH" = 1 ] || [ ! -f "data/briefings/$TODAY.json" ]; then
  echo "Generating today's brief..."
  npm run --silent generate || echo "Generation failed - the page will show sample data."
fi

if [ ! -f dist/web/index.html ] || [ -n "$(find src/web src/shared -newer dist/web/index.html -print -quit 2>/dev/null)" ]; then
  echo "Building the web app..."
  npm run --silent build >/dev/null
fi

PORT="$(kip_port)"
URL="http://127.0.0.1:$PORT"
( for _ in $(seq 1 60); do curl -s -o /dev/null "$URL" && break; sleep 0.25; done; open_browser "$URL" ) &
export KIP_PORT="$PORT"
exec npm run --silent serve
