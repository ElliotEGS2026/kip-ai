# Kip — project spec & plan

## Goal
Local app run each morning (~9am). Generates a daily briefing, shows it on `http://127.0.0.1:47821` (React), with a button to shut the server down. Portable: clone from GitHub, no hard-coded paths, secrets only in `.env`/`data/`. Owner is a forward deployed engineer (Windows, work Microsoft 365 later). Text only, no voice.

## Sections (order fixed)
1. Brain teaser: chess theme weighted to weak themes → Lichess `/training/<theme>` link; solved/missed buttons update `data/chess-weaknesses.json`
2. Yesterday's notes + open loops (`data/notes/YYYY-MM-DD.md`, written via the in-app note box or voice dictation; `- [ ]` = open loop, `- [x]` closes it)
3. Today's meetings (Microsoft Graph if connected, else ICS link) + rule-based one-line prep
4. Email: unread/flagged/high-importance mail with no later sent reply (Microsoft only)
5. Job-critical: GitHub release feeds + npm major bumps + high/critical OSV advisories for `config/stack.md`, plus extra feeds from `config/sources.md`
6. World news from RSS feeds, minus `config/blocklist.md`, favourites first
7. Today's plan: derived after the others run (never fetches): today's meetings, open-loop tasks, emails awaiting reply, a "review job-critical" nudge. Replaces the old 15-minute wake-up block.
UI (V2): sections 1+2 share the first page as tabs; then meetings, email, job-critical, world, plan; then sections spread out as clickable orbs.

## Architecture
`generate` (collectors in parallel, per-section timeout/isolation, zod validation, link check) → `data/briefings/DATE.json|md` → Fastify serves API + built React app. No AI in v1 (needs a paid Claude plan; Claude Code headless is `claude -p --output-format json --json-schema …`, docs: code.claude.com/docs/en/headless).

API (all need token): `GET /api/brief/:date` · `POST /api/feedback` · `POST /api/puzzle-result` · `GET|POST /api/notes` · `GET /api/ms/status`, `POST /api/ms/connect|disconnect` · `POST /api/shutdown`.

## Decisions
- Port 47821 (unusual, to avoid clashing with other dev servers).
- Microsoft: plain-fetch device-code flow, scopes `Calendars.Read Mail.Read User.Read offline_access`; refresh token in `data/ms-token.json` (gitignored, file mode 0600). Chosen over msal-node to avoid native deps; see issues file for the DPAPI trade-off.
- Teams chat not requested (Chat.Read consent requirement unverified).
- `.sh` scripts are thin wrappers; logic is TypeScript. On Windows they need Git Bash.
- Dead links → `unverified`, not dropped.

## Build status (v1)
- [x] Scaffold, schema, fixture, md config helpers
- [x] Server + security guard + tests (shutdown token/Origin/Host/JSON)
- [x] React UI (red theme, error cards, feedback, notes, chess buttons, shutdown) — verified in browser
- [x] Generator + 7 collectors + retention + link check; live-run verified for GitHub/npm
- [x] Scripts + pre-commit hook — verified on Linux
- [x] Microsoft connector — written, NOT tested against a live account
- [ ] Verify on Windows + real Microsoft account; verify OSV/feeds from an unrestricted network
- [ ] v2: AI summaries via `claude -p` (one subagent per section)

## Acceptance criteria (status)
1. Fresh clone `./scripts/start.sh` → working page (sample fixture if no brief): verified on Linux.
2. Shutdown button stops server, port freed; no-token rejected: verified (tests + browser).
3. Feedback buttons change `config/blocklist.md`/`sources.md`; next generation respects them: covered by tests (API write + `applyPrefs`).
4. Puzzle results update `data/chess-weaknesses.json` and bias next pick: covered by tests.
5. Every news/security item has a working link: link checker marks failures unverified; live-run confirmed 13/13 GitHub release links.
