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
- Notes: type or speak on the "Add a new note" page (saved automatically when you leave it; change any note later with ✎ Edit); stored in `data/notes/` (gitignored). `- [ ] task` lines become open loops until a `- [x] task` line exists.

## Connect Microsoft (calendar + mail, read-only)
1. Entra admin center → App registrations → New (account type per your needs) → Authentication → enable **Allow public client flows**.
2. API permissions (delegated): `Calendars.Read`, `Mail.Read`, `User.Read`. Work tenants may need admin consent.
3. Put the Application (client) ID in `.env` as `KIP_MS_CLIENT_ID` (`KIP_MS_TENANT=organizations` for work-only).
4. Restart Kip → **Connect Microsoft** → enter the shown code at the Microsoft page. The login is remembered in `data/ms-token.json` (gitignored); **Disconnect** deletes it.
Status: written to Microsoft's documented endpoints, not yet tested on a live account.

## Windows desktop icon & taskbar
One-time setup puts a red **K** shortcut on your Desktop that starts Kip with a double-click:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-shortcut.ps1
```
1. It writes the icon (`scripts/windows/kip.ico`) and `Desktop\Kip.lnk`, which runs `./scripts/start.sh` in Git Bash from this repo folder (needs Git for Windows and Node 22+).
2. Double-click **Kip**: it installs/generates/builds as needed, starts the server and opens the browser. A Git Bash window stays open while Kip runs; use **Shut down** in the UI or close that window to stop it.
3. To pin it: right-click the Desktop **Kip** icon → **Pin to taskbar** (Windows 11: Show more options first). Pin from the shortcut, not a running window, so the icon and launch settings are kept.
4. If you move the repo folder, run the install command again.

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
| `scripts/` | `windows/install-shortcut.ps1` (makes the icon and Desktop shortcut), `start.sh` (install, generate, build, open), `stop.sh`, `generate.sh`, `schedule.sh` (daily run), `hooks/pre-commit` (blocks secrets and `data/`). |
| `tests/` | `*.test.ts` are fast Vitest unit/API tests. **`tests/e2e/`** are Playwright browser tests that drive the real UI against a throwaway server and temp dirs (`npm run test:e2e`). |
| `docs/` | `PROJECT_SPEC.md` (goals and decisions) and `FUTURE_PLANS_ASSUMPTIONS_ISSUES.md`. |
| `CLAUDE.md`, `.claude/` | Working notes and helper agent/skill for Claude Code. |

### Key decisions
- **Local only, read-only:** bound to `127.0.0.1`, never sends, deletes or changes email/calendar.
- **Honest sources:** every news item needs a link and date, dead links are marked unverified, nothing is invented.
- **Notes aren't done until you say so:** they return each day until ticked Completed; `- [ ]` lines become tasks until a matching `- [x]` appears.
- **Few dependencies:** Fastify, zod, React, Vite, fast-xml-parser (plus tsx, vitest and Playwright for dev).

## How the backend works (step by step)
"Backend" in Kip is just two small Node programs written in TypeScript. They never talk to each other directly, they share **files in `data/`**.

```
   (1) GENERATOR  — runs once a day, or when you ask        (2) SERVER  — runs while you use the app
   npm run generate  →  src/generator/                      npm run serve  →  src/server/

   internet / calendar / mail                                browser (React UI)
          │                                                       ▲   │  GET /api/brief/today
          ▼                                                       │   ▼  POST /api/notes, /api/feedback ...
   collectors/*  (one per section)                          Fastify server on 127.0.0.1
          │                                                       │   ▲
          ▼                                                       ▼   │
   data/briefings/2026-11-08.json  ───────── read by ───────►  data/ (briefings, notes, state) + config/*.md
```

### A. The generator: building the daily brief
Entry point: `src/generator/cli.ts` → `generate()` in `run.ts`. In order:
1. **Run the collectors side by side.** Each file in `collectors/` has the same shape: it receives `{ today, now }` and returns `{ items, warnings }` (or a puzzle). `chess`, `notes`, `meetings`, `email`, `work` and `world` all run at the same time.
2. **Each one is fenced in by `runSection()`.** It adds a 60 second timeout, checks the result with the zod schema, and turns any problem into a card instead of a crash: an exception → "Something went wrong" card, `throw new NotConfigured(...)` → "Not set up yet" card. That is why one broken feed never breaks the rest.
3. **Build "today's plan".** `collectors/today.ts` runs afterwards and only *rearranges* what the others returned (meetings, open tasks and priority notes, emails awaiting a reply, a "review N updates" line). It fetches nothing.
4. **Check links.** `verifyLinks()` makes a request to every news/security link. Dead ones are marked `unverified` so you are never told something is verified when it isn't.
5. **Validate and save.** The whole thing must pass `BriefingSchema` (`shared/schema.ts`), then is written to `data/briefings/DATE.json` (plus a `.md` copy). Files older than 14 days are deleted, because they can hold email and meeting text.

What the collectors use:
| Collector | Where its data comes from |
|---|---|
| `work.ts` | GitHub release feeds and npm/OSV for the packages in `config/stack.md`, plus platform news feeds. Filters (`filters.ts`) drop blocked outlets and rank favourites; `balance.ts` makes sure both "your stack" and "general news" get a fair share of the 10 slots. Release titles are prefixed with the repo name. |
| `world.ts` | News RSS feeds listed in `config/sources.md`, mixed across politics, world and economy. |
| `meetings.ts` / `email.ts` | Microsoft Graph through `connectors/microsoft.ts` if you signed in, otherwise an ICS calendar link (`ics.ts`) for meetings. Read-only. |
| `notes.ts` | Your saved notes in `data/notes/DATE.md` plus your Completed/Priority choices in `data/note-state.json`. |
| `chess.ts` | Picks today's theme, favouring ones you miss (`data/chess-weaknesses.json`), and links to Lichess. No API call. |

Shared helpers: `net.ts` (`fetchT` = fetch with a timeout and clear errors), `feed.ts` (reads RSS/Atom and makes short plain-text summaries).

### B. The server: serving the brief and saving your actions
`src/server/index.ts` makes a random **token**, starts Fastify on `127.0.0.1` only, and writes a pid file so `stop.sh` can find it. `app.ts` holds the routes:
| Route | What it does |
|---|---|
| `GET /api/brief/:date` | Reads `data/briefings/DATE.json`. For today it first calls `refreshNotes()` so notes you wrote after the morning run appear. If no brief exists it returns the sample from `fixtures/`. |
| `POST /api/notes` | Appends a note (`### HH:MM` block) to `data/notes/DATE.md`. Used by auto-save when you leave "Add a new note". |
| `GET /api/notes/:id`, `POST /api/notes/edit` | Read and replace one saved note's text (the ✎ Edit button). The note's id is a hash of its date, time and text, so an edit gives it a new id and the server moves your Completed/Priority choice across. |
| `POST /api/notes/state` | Saves Completed / Priority / Deleted for one note in `data/note-state.json`. |
| `POST /api/feedback` | 👍/👎 on a source: adds the domain to `config/sources.md` or `config/blocklist.md` via `mdConfig.ts`. |
| `POST /api/puzzle-result`, `GET /api/puzzle-stats` | Records solved/missed so future themes favour your weak spots. |
| `GET/POST /api/ms/*` | Microsoft sign-in status, connect (device code) and disconnect. |
| `POST /api/shutdown` | Stops the server (the Shut down button). |
| anything else | Serves the built React app from `dist/web`, inserting the token into `index.html`. |

### C. The security guard (`security.ts`)
It runs before every request. Think of it as three locks:
1. **Host lock:** the `Host` header must be `127.0.0.1:PORT` or `localhost:PORT`. This stops a malicious website from pointing its own domain at your machine ("DNS rebinding").
2. **Token lock:** every `/api` call must carry the `x-kip-token` header. The token only exists in the page Kip itself serves, so other sites can't read it.
3. **Origin + JSON lock:** anything that changes data (POST) must also come from Kip's own origin and be `application/json`, which a plain HTML form on another site cannot send.

### D. How a click travels end to end (example: ✓ Completed on a note)
1. The checkbox in `src/web/Slides.tsx` calls `setNote()` in `App.tsx`, which updates the screen immediately.
2. `api.ts` sends `POST /api/notes/state` with the token header.
3. The guard checks host, token, origin and content type; zod checks the body (`NoteStateInput`).
4. `setNoteState()` in `shared/notes.ts` writes `data/note-state.json`.
5. Next time the brief loads, `notes.ts` reads that file, so the note shows struck-out today and disappears tomorrow.

### E. Where to look when something is wrong
- A section shows an error card → read its message; the collector file named after the section is where it came from.
- Nothing updates → run `npm run generate` and read the per-section status it prints.
- `403` errors in the browser console → the guard rejected the call (wrong token or Host, usually a stale tab after a restart: reload the page).
- Anything you want to try safely → the Playwright and Vitest tests run against temporary folders, never your real `data/`.
