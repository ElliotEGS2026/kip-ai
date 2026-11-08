# Kip — project spec & plan

## Goal
Local app run each morning (~9am). Generates a daily briefing, shows it on `http://127.0.0.1:47821` (React), with a button to shut the server down. Portable: clone from GitHub, no hard-coded paths, secrets only in `.env`/`data/`. Owner is a forward deployed engineer (Windows, work Microsoft 365 later). Text only, no voice.

## Sections (order fixed)
1. Brain teaser: chess theme weighted to weak themes → Lichess `/training/<theme>` link; solved/missed buttons update `data/chess-weaknesses.json`
2. Previous notes + open loops (`data/notes/YYYY-MM-DD.md`, written via the in-app note box or voice; `- [ ]` = open loop, `- [x]` closes it). Notes are **not completed by default** and keep coming back until the user ticks **Completed**. **Priority** notes are listed first (and appear in Today's plan). Per-note choices live in `data/note-state.json` (older `seen`/`remind` fields are still understood). Several notes share one page as bullet points (max 5 / ~800 chars, then another page). Leaving a page with uncompleted notes shows a pop-up: Mark completed / Keep for later / Stay. The home-page core button opens this section: review notes, then add a new note. A note completed today stays listed struck-out with a **Delete** button (hides it for good; the text stays in `data/notes/`) and drops off from the next day by default. Saving a new note refreshes the list immediately (the server rebuilds the notes section on each load).
3. Today's meetings (Microsoft Graph if connected, else ICS link) + rule-based one-line prep
4. Email: unread/flagged/high-importance mail with no later sent reply (Microsoft only)
5. Job-critical (10 items, ≥3 general platform/industry news and ≥3 from your own stack, rest by priority breaking > security > major > release > news): GitHub release feeds + npm major bumps + high/critical OSV advisories for `config/stack.md`, plus wide-spread platform news (Node.js blog/vulnerabilities, GitHub changelog, TypeScript blog, BleepingComputer) filtered to breaking changes, majors and ecosystem-wide security issues (`## Platform news` in `config/sources.md`)
6. World news (10 items): Guardian + BBC; >=2 government/economy (`## Government & economy news`), >=4 politics/finance in total (`## Politics & finance news`), >=3 general world (`## World news`), rest by priority; category comes from the feed, outlets alternate so neither crowds out the other; minus `config/blocklist.md`, favourites first
7. Today's plan: derived after the others run (never fetches), one column top to bottom: today's meetings (by time), open tasks (priority notes first), emails awaiting reply, a "review job-critical" nudge. Replaces the old 15-minute wake-up block.
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
