# Kip — working notes for Claude

Kip is a personal, local-only morning briefing app (red theme). Read `docs/PROJECT_SPEC.md` for goals/decisions and `docs/FUTURE_PLANS_ASSUMPTIONS_ISSUES.md` before changing behaviour.

## Commands
- `./scripts/start.sh [--refresh]` run everything (Git Bash on Windows) · `scripts/generate.sh` brief only · `scripts/stop.sh` fallback stop
- `npm run typecheck` · `npm test` · `npm run build` · `npm run generate` · `npm run serve`
- Always run `npm run typecheck && npm test` before committing.

## Layout
- `src/shared` schema (zod), paths, md-config helpers, chess state — used by server AND generator
- `src/server` Fastify on 127.0.0.1 (default port 47821, `KIP_PORT`); `security.ts` is the guard
- `src/generator` `run.ts` orchestrates `collectors/*` (one per section); `cli.ts` entry
- `src/connectors/microsoft.ts` read-only Graph via device-code OAuth (plain fetch)
- `src/web` React + Vite UI · `config/*.md` hand-editable prefs · `data/` private runtime data (gitignored) · `fixtures/` sample brief

## Section order (fixed; enforced by schema)
chess (brain teaser) → notes → meetings → email → work (job-critical) → world → today (derived plan; built from the others, not a collector)

## Conventions
- Strict TypeScript, ESM, no `any` unless parsing external JSON. Validate all API input and the briefing with zod.
- Minimal deps (fastify, zod, react, vite, fast-xml-parser, tsx, vitest). Ask before adding any other framework/language.
- Each section fails independently: collectors throw → error card; `NotConfigured` → "not set up" card. Never let one source break the brief.
- Every `work`/`world` item needs `url` + `date` (or `unverified: true`). Dead links are auto-marked unverified. Never invent sources, versions, or API shapes — verify or label UNVERIFIED.
- Read-only access to email/calendar/Teams. Never send/delete/modify.
- Config files are markdown with `## Heading` + `- bullet`; code edits them only via `shared/mdConfig.ts` (preserves hand edits).

## Security rules (do not weaken)
- Bind 127.0.0.1 only. All `/api` calls need `x-kip-token` (random per run, injected into index.html). Unsafe methods also need matching `Origin` + `application/json`. Every request needs a matching `Host` (DNS-rebinding defence). Tests in `tests/server.test.ts` cover shutdown rejection.
- Secrets only in `.env` / `data/` (both gitignored). Never log email/Teams content. Briefings are pruned after 14 days. `scripts/hooks/pre-commit` blocks `.env`, `data/`, token-like strings.

## Testing notes
- Tests set `KIP_DATA_DIR` / `KIP_CONFIG_DIR` to temp dirs — never touch real `data/` or `config/`.
- Network collectors are tested with `vi.stubGlobal("fetch", …)`. Adding a collector: use the `new-collector` skill.

## Known unverified/untested (see docs): Microsoft live sign-in, OSV/hnrss/BBC feeds (blocked in the build sandbox), Windows `.sh` branches and `schedule.sh`, Lichess puzzle API (not used in v1).
