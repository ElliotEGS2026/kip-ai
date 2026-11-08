# Kip

Personal morning briefing, local only. Red UI at `http://127.0.0.1:47821` with a shutdown button.
Sections: chess brain teaser · notes & open loops · meetings · email · job-critical updates · world news · today's plan.

## Quick start
Needs Node 22+ (and Git for Windows → Git Bash on Windows).
```bash
git clone https://github.com/ElliotEGS2026/kip-ai && cd kip-ai
./scripts/start.sh            # installs, generates today's brief, builds, opens the browser
./scripts/start.sh --refresh  # regenerate the brief
./scripts/stop.sh             # fallback if the UI's "Shut down server" button isn't reachable
```
With nothing configured you get calendar/email "not set up" cards, live release/news sections (if online) and a sample banner until the first real brief exists.

## Configure
- `.env` (created from `.env.example`, gitignored): `KIP_PORT`, `KIP_ICS_URL`, `KIP_MS_CLIENT_ID`, `KIP_MS_TENANT`.
- `config/stack.md` packages/repos to watch · `config/sources.md` feeds + favourites · `config/blocklist.md`. Edit by hand or use 👍/👎 in the UI.
- Notes: use the "Quick note" box; stored in `data/notes/` (gitignored). `- [ ] task` lines become open loops until a `- [x] task` line exists.

## Connect Microsoft (calendar + mail, read-only)
1. Entra admin center → App registrations → New (account type per your needs) → Authentication → enable **Allow public client flows**.
2. API permissions (delegated): `Calendars.Read`, `Mail.Read`, `User.Read`. Work tenants may need admin consent.
3. Put the Application (client) ID in `.env` as `KIP_MS_CLIENT_ID` (`KIP_MS_TENANT=organizations` for work-only).
4. Restart Kip → **Connect Microsoft** → enter the shown code at the Microsoft page. The login is remembered in `data/ms-token.json` (gitignored); **Disconnect** deletes it.
Status: written to Microsoft's documented endpoints, not yet tested on a live account.

## Schedule 9am
`./scripts/schedule.sh install` (Windows Task Scheduler; macOS/Linux prints a cron line). Sleeping machines miss the run — opening Kip later still generates the day's brief.

## Develop
`npm run typecheck && npm test` · `npm run build` · `npm run generate`. See `CLAUDE.md` and `docs/`.
