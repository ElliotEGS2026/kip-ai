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
`npm run typecheck && npm test` · `npm run test:e2e` · `npm run build` · `npm run generate`. See `CLAUDE.md` and `docs/`.

## How the app works
Kip has two halves that only meet through one JSON file per day:
1. **Generator** (`npm run generate`) asks each source for its data and writes `data/briefings/YYYY-MM-DD.json`.
2. **Server + UI** (`npm run serve`) serves that file to a React page on `127.0.0.1`, one item at a time. Notes you write later are merged in when the page loads.

Each section is collected on its own, so one failure becomes an error card and never breaks the rest. Section order is fixed: brain teaser → notes → meetings → email → job-critical → world → today's plan (the plan is built from the other sections, it has no source of its own).

### File structure
| Path | What it does |
|---|---|
| `src/shared/` | Code used by both halves. **`schema.ts`** (zod) defines the briefing and is the single source of truth for its shape. `paths.ts` locates data/config dirs, `dates.ts` + `text.ts` are tiny shared helpers, `notes.ts` and `chessState.ts` read/write saved state, **`mdConfig.ts`** is the only code allowed to edit `config/*.md` (it keeps your hand edits). |
| `src/generator/` | Builds the briefing. **`run.ts`** runs every collector with a timeout, validates the result, saves it and prunes files older than 14 days. `cli.ts` is the entry point, `refresh.ts` rebuilds the note-based sections on demand. `net.ts` (safe fetch + dead-link check), `feed.ts` (RSS/Atom), `filters.ts` (block/favourite rules) and `balance.ts` (fair mix of sources) are shared helpers. |
| `src/generator/collectors/` | One file per section: `chess`, `notes`, `meetings` (+`ics`), `email`, `work`, `world`, and **`today.ts`**, which derives the plan from the others. To add a section use these as a pattern. |
| `src/connectors/microsoft.ts` | Read-only Microsoft Graph sign-in (device code) for calendar and mail. |
| `src/server/` | Fastify API. **`security.ts`** is the guard (localhost only, per-run token, Origin and Host checks) and must not be weakened. `app.ts` holds the routes, `index.ts` starts the server, `microsoftRoutes.ts` the sign-in routes. |
| `src/web/` | The React UI. `App.tsx` is the page shell and state; `Slides.tsx` builds and draws each slide; `Reader.tsx` is the Back/Next panel and the "uncompleted notes" popup; `Hud.tsx` is the header widgets and the central "core" ring; `Notes.tsx` + `Voice.ts` capture typed or spoken notes; `format.ts` holds display helpers/icons; `api.ts` attaches the security token to requests; `styles.css` is the red theme. |
| `config/*.md` | Your preferences: `stack.md` (what to watch), `sources.md` (feeds, favourites), `blocklist.md`. Plain markdown, editable by hand or via the 👍/👎 buttons. |
| `data/` | Private runtime data (briefings, notes, tokens). Gitignored. |
| `fixtures/briefing.sample.json` | Sample briefing shown until the first real one exists. |
| `scripts/` | `start.sh` (install, generate, build, open), `stop.sh`, `generate.sh`, `schedule.sh` (daily run), `hooks/pre-commit` (blocks secrets and `data/`). |
| `tests/` | `*.test.ts` are fast Vitest unit/API tests. **`tests/e2e/`** are Playwright browser tests that drive the real UI against a throwaway server and temp dirs (`npm run test:e2e`). |
| `docs/` | `PROJECT_SPEC.md` (goals and decisions) and `FUTURE_PLANS_ASSUMPTIONS_ISSUES.md`. |
| `CLAUDE.md`, `.claude/` | Working notes and helper agent/skill for Claude Code. |

### Key decisions
- **Local only, read-only:** bound to `127.0.0.1`, never sends, deletes or changes email/calendar.
- **Honest sources:** every news item needs a link and date, dead links are marked unverified, nothing is invented.
- **Notes aren't done until you say so:** they return each day until ticked Completed; `- [ ]` lines become tasks until a matching `- [x]` appears.
- **Few dependencies:** Fastify, zod, React, Vite, fast-xml-parser (plus tsx, vitest and Playwright for dev).
