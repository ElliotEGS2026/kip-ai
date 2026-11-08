---
name: new-collector
description: Add or change a briefing section collector in Kip (src/generator/collectors). Use when adding a data source, a new feed type, or a new section.
---
# Adding a Kip collector
1. Create `src/generator/collectors/<name>.ts` exporting a `Collector` (`(ctx) => Promise<Result>`), returning `{ items, warnings?, puzzle? }`.
   - Source not set up → `throw new NotConfigured("how to configure")` (renders "not set up").
   - Partial failures (one feed of many) → push to `warnings`; return `status: "error"` only if everything failed.
   - Use `fetchT` from `../net.js` (timeout + host-naming errors). Read-only calls only.
2. News/security items MUST have `url` + `date` (YYYY-MM-DD). Never invent either; drop the item instead. Link checking happens in `run.ts` for `work`/`world`.
3. Respect prefs: pass entries through `applyPrefs(entries, loadPrefs())`.
4. New *section* (rare): add id to `SECTION_IDS` + `SECTION_TITLES` in `src/shared/schema.ts` (order is fixed and enforced), register in `COLLECTORS` in `run.ts`, update fixture, `CLAUDE.md` and the UI.
5. Test in `tests/` with `vi.stubGlobal("fetch", …)` and temp `KIP_DATA_DIR`/`KIP_CONFIG_DIR`. Cover: happy path, one source failing, all failing.
6. `npm run typecheck && npm test`, then a real `npm run generate` and read the output for sanity.
