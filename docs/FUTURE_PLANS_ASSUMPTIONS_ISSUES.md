# Future plans, assumptions, potential issues

## Assumptions
- Single user, single machine at a time; everything local. Notes/login stay on each machine (gitignored).
- Windows + Git Bash is the main platform; Linux/macOS supported.
- Work account will be Microsoft 365 (Entra). Tenant policy may require admin consent for the app registration — unknown until tried.
- Free tier only for now: no AI summarisation.
- Default feeds (hnrss.org query, BBC) are my picks, not verified from the build sandbox; edit `config/sources.md` freely.

## Potential issues (known)
- **Microsoft connector untested live.** Needs an Entra app registration with "Allow public client flows" on. Graph query shapes (`calendarView`, `messages` filter/orderby) are untested; expect small fixes on first real run.
- **Token storage:** refresh token is plain JSON in `data/ms-token.json` (file mode is ignored on Windows). Upgrade path: `@azure/msal-node-extensions` (DPAPI) — adds a native dependency.
- **ICS:** recurring events (RRULE) are not expanded; `TZID` times treated as local.
- **OSV:** queried per package without version/pagination; only High/Critical from last 30 days. Severity comes from `database_specific.severity` (present for GitHub advisories, may be missing → skipped).
- **Monorepo releases** (`pkg@x`, `scope/pkg`) are filtered out heuristically; a main project tagged that way would be hidden.
- **Link check:** 403/405 count as alive (bot blocking); paywalled links still pass.
- **Scheduling:** Task Scheduler only runs while awake; start.sh also generates on first launch of the day. `schedule.sh` Windows branch untested; "start when available after missed run" is not set by it.
- **Windows scripts:** `stop.sh` uses `taskkill` with the Node PID; untested on Windows. Browser opens via `cmd.exe /c start`.
- Chess uses theme links only; no puzzle board in-app, solve state is self-reported.
- Briefing/notes may contain work-sensitive text: keep `data/` out of git and cloud sync unless intended.

## Future plans (rough priority)
1. Test + harden Microsoft connector on the work account; Teams (needs consent check on `Chat.Read`).
2. AI layer: `claude -p --output-format json --json-schema` per section (agents in `.claude/agents`, shared formatting skill) for meeting prep, email insights, news summaries. Needs a paid plan or API key; keep `LLM_PROVIDER=none` fallback.
3. Lichess API for real puzzles/themes (verify endpoints and auth first); in-app board.
4. Chat-style "ask Kip" panel (text only).
5. DPAPI token storage; Google Calendar/Gmail adapter behind the same interfaces.
6. Windows "start when available" scheduled task via PowerShell; desktop notification at 9am.
7. Sync notes across machines (opt-in), importing notes from other apps.
