import fs from "node:fs";
import path from "node:path";
import { configDir, dataDir } from "../../shared/paths.js";
import type { Item } from "../../shared/schema.js";
import { fetchT } from "../net.js";
import { fetchFeed } from "../feed.js";
import { applyPrefs, loadPrefs } from "../filters.js";
import type { Collector } from "../types.js";

const DAY = 86400000;
const stateFile = (): string => path.join(dataDir(), "state.json");
const readState = (): { npm: Record<string, string> } => { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return { npm: {} }; } };

export function stackFromText(md: string): { npm: string[]; gh: string[] } {
  const out = { npm: [] as string[], gh: [] as string[] };
  for (const m of md.matchAll(/^-\s+(npm|gh):\s*(\S+)\s*$/gim)) (m[1]!.toLowerCase() === "npm" ? out.npm : out.gh).push(m[2]!);
  return out;
}

interface OsvVuln { id: string; summary?: string; published?: string; database_specific?: { severity?: string } }

export const work: Collector = async ({ now, today }) => {
  const stack = stackFromText(fs.readFileSync(path.join(configDir(), "stack.md"), "utf8"));
  const prefs = loadPrefs();
  const items: Item[] = [];
  const warnings: string[] = [];
  let attempted = 0, failed = 0;
  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    attempted++;
    try { await fn(); } catch (e) { failed++; warnings.push(`${label}: ${(e as Error).message}`); }
  };

  // 1) GitHub release feeds + extra news feeds
  const feeds = [...stack.gh.map((r) => ({ url: `https://github.com/${r}/releases.atom`, tag: "release", days: 14 })), ...prefs.work.map((url) => ({ url, tag: "news", days: 7 }))];
  await Promise.all(feeds.map((f) => run(new URL(f.url).hostname + new URL(f.url).pathname.slice(0, 40), async () => {
    // Skip monorepo sub-package releases ("pkg@1.0", "scope/pkg"): they drown out the main project's releases.
    const entries = (await fetchFeed(f.url)).filter((e) => now.getTime() - e.ms < f.days * DAY && (f.tag !== "release" || !/[@/]/.test(e.title)));
    for (const e of applyPrefs(entries, prefs).slice(0, f.tag === "release" ? 2 : 4)) items.push({ id: e.url, title: e.title, url: e.url, date: e.date, tag: f.tag, source: new URL(e.url).hostname });
  })));

  // 2) Major version bumps (baseline recorded on first run, reported afterwards)
  const state = readState();
  await Promise.all(stack.npm.map((name) => run(`npm ${name}`, async () => {
    const r = await fetchT(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
    if (!r.ok) throw new Error(`registry answered ${r.status}`);
    const version = ((await r.json()) as { version?: string }).version;
    if (!version) throw new Error("no version in response");
    const prev = state.npm[name];
    if (prev && prev.split(".")[0] !== version.split(".")[0]) {
      items.push({ id: `npm-${name}-${version}`, title: `${name} major release: ${prev} → ${version}`, url: `https://www.npmjs.com/package/${name}`, date: today, tag: "release", source: "npmjs.com" });
    }
    state.npm[name] = version;
  })));
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2));

  // 3) High/critical advisories published in the last 30 days (OSV; GitHub advisories feed it)
  await Promise.all(stack.npm.map((name) => run(`osv ${name}`, async () => {
    const r = await fetchT("https://api.osv.dev/v1/query", { method: "POST", body: JSON.stringify({ package: { name, ecosystem: "npm" } }) }, 15000);
    if (!r.ok) throw new Error(`OSV answered ${r.status}`);
    for (const v of ((await r.json()) as { vulns?: OsvVuln[] }).vulns ?? []) {
      const sev = (v.database_specific?.severity ?? "").toUpperCase();
      const ms = Date.parse(v.published ?? "");
      if (!["HIGH", "CRITICAL"].includes(sev) || Number.isNaN(ms) || now.getTime() - ms > 30 * DAY) continue;
      items.push({ id: v.id, title: `${name}: ${v.summary ?? v.id} (${sev})`, url: `https://osv.dev/vulnerability/${v.id}`, date: new Date(ms).toISOString().slice(0, 10), tag: "security", source: "osv.dev" });
    }
  })));

  if (attempted > 0 && failed === attempted) return { status: "error", message: `All sources failed. ${warnings[0] ?? ""}`, warnings };
  const rank = (i: Item): number => (i.tag === "security" ? 0 : i.tag === "release" ? 1 : 2);
  items.sort((a, b) => rank(a) - rank(b) || (b.date ?? "").localeCompare(a.date ?? ""));
  return { items: items.slice(0, 15), warnings };
};
