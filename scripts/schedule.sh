#!/usr/bin/env bash
# Schedules Kip at 09:00. Windows (Git Bash): Task Scheduler. macOS/Linux: prints a cron line (not installed for you).
# Usage: scripts/schedule.sh install|remove      STATUS: Windows branch untested (see docs).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
ACTION="${1:-install}"
if is_windows; then
  if [ "$ACTION" = "remove" ]; then schtasks //Delete //F //TN KipMorningBrief; exit 0; fi
  BASH_WIN="$(cygpath -w "$(command -v bash)")"
  schtasks //Create //F //SC DAILY //ST 09:00 //TN KipMorningBrief \
    //TR "\"$BASH_WIN\" -lc \"cd '$ROOT' && ./scripts/start.sh\""
  echo "Scheduled daily at 09:00. If the PC is asleep then, open Kip manually: it builds the brief on first start of the day."
else
  echo "Add this line with 'crontab -e' (runs only while the machine is awake):"
  echo "0 9 * * 1-5 cd '$ROOT' && KIP_NO_BROWSER= ./scripts/start.sh"
fi
