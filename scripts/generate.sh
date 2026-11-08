#!/usr/bin/env bash
# Generates today's brief only (no server).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ -d node_modules ] || npm install --no-audit --no-fund
exec npm run --silent generate
