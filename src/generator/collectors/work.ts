import fs from "node:fs";
import path from "node:path";
import { configDir, dataDir } from "../../shared/paths.js";
import type { Item } from "../../shared/schema.js";
import { fetchT } from "../net.js";
import { excerpt, fetchFeed } from "../feed.js";
import { applyPrefs, loadPrefs } from "../filters.js";
import { balance } from "../balance.js";
import type { Collector } from "../types.js";

export const WORK_TOTAL = 10;
export const MIN_GENERAL = 3;
export const MIN_STACK = 3;

const DAY = 86400000;
const stateFile = (): string => path.join(dataDir(), "state.json");
const readState = (): { npm: Record<string, string> } => { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return { npm: {} }; } };

export function stackFromText(md: string): { npm: string[]; gh: string[] } {
  const out = { npm: [] as string[], gh: [] as string[] };
  for (const m of md.matchAll(/^-\s+(npm|gh):\s*(\S+)\s*$/gim)) (m[1]!.toLowerCase() === "npm" ? out.npm : out.gh).push(m[2]!);
  return out;
}

interface OsvVuln { id: string; summary?: string; details?: string; published?: string; database_specific?: { severity?: string } }

/** Platform feeds are noisy; keep only what looks like a wide-spread change. */
export const WIDESPREAD = /breaking|deprecat|end[- ]of[- ]life|\bEOL\b|vulnerab|zero-day|supply[- ]chain|\bCVE-|critical|security (release|update|advisory)|malicious|ransomware|outage|major (release|version)|\bv?\d+\.0\.0\b|node\.js\s?v?\d+|\bnpm\b|released|release candidate/i;

/** One label per item, most important first: breaking > security > major > base. */
export function classify(title: string, summary: string | undefined, base: string): string {
  const text = `${title} ${summary ?? ""}`;
  if (/breaking change|\bbreaking\b|removed support|no longer supported|end[- ]of[- ]life|deprecat/i.test(text)) return "breaking";
  if (/vulnerab|zero-day|\bCVE-|supply[- ]chain|malicious|security (release|update|advisory)|ransomware/i.test(text)) return "security";
  if (/\b(v|version\s)?\d+\.0\.0\b|major (release|version)|node\.js\s?v?\d+(\s|$)/i.test(title)) return "major";
  return base;
}

export const work: Collector = async ({ now, today }) => {
  const stack = stackFromText(fs.readFileSync(path.join(configDir(), "stack.md"), "utf8"));
  const prefs = loadPrefs();
  const items: Item[] = [];
  const warnings: string[] = [];
  /** ids of "general" items: wide-spread platform/industry news (as opposed to your own stack's releases/advisories). */
  const general = new Set<string>();
  let attempted = 0, failed = 0;
  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    attempted++;
    try { await fn(); } catch (e) { failed++; warnings.push(`${label}: ${(e as Error).message}`); }
  };

  // 1) GitHub release feeds + extra news feeds
  const feeds = [
    ...stack.gh.map((r) => ({ url: `https://github.com/${r}/releases.atom`, tag: "release", days: 14, filter: false, repo: r })),
    ...prefs.work.map((url) => ({ url, tag: "news", days: 7, filter: false, repo: "" })),
    ...prefs.platform.map((url) => ({ url, tag: "platform", days: 10, filter: true, repo: "" })),
  ];
  await Promise.all(feeds.map((f) => run(new URL(f.url).hostname + new URL(f.url).pathname.slice(0, 40), async () => {
    // Skip monorepo sub-package releases ("pkg@1.0", "scope/pkg"): they drown out the main project's releases.
    const entries = (await fetchFeed(f.url)).filter((e) => now.getTime() - e.ms < f.days * DAY && (f.tag !== "release" || !/[@/]/.test(e.title)) && (!f.filter || WIDESPREAD.test(`${e.title} ${e.summary ?? ""}`)));
    for (const e of applyPrefs(entries, prefs).slice(0, f.tag === "release" ? 2 : f.tag === "platform" ? 3 : 4)) {
      if (f.tag !== "release") general.add(e.url);
      // A bare "v2.1.318" says nothing: name the project, and show where it came from.
      const title = f.repo ? `${f.repo} ${e.title}` : e.title;
      items.push({ id: e.url, title, url: e.url, date: e.date, tag: classify(e.title, e.summary, f.tag === "platform" ? "news" : f.tag), summary: e.summary, source: f.repo ? `github.com/${f.repo}` : new URL(e.url).hostname });
    }
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
      items.push({ id: `npm-${name}-${version}`, title: `${name} major release: ${prev} → ${version}`, url: `https://www.npmjs.com/package/${name}`, date: today, tag: "major", summary: "New major version of a package in your stack. Majors can contain breaking changes - read the changelog before upgrading.", source: "npmjs.com" });
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
      items.push({ id: v.id, title: `${name}: ${v.summary ?? v.id} (${sev})`, url: `https://osv.dev/vulnerability/${v.id}`, date: new Date(ms).toISOString().slice(0, 10), tag: "security", summary: v.details ? excerpt(v.details) : undefined, source: "osv.dev" });
    }
  })));

  if (attempted > 0 && failed === attempted) return { status: "error", message: `All sources failed. ${warnings[0] ?? ""}`, warnings };
  const rank = (i: Item): number => ({ breaking: 0, security: 0, major: 1, release: 2 } as Record<string, number>)[i.tag ?? ""] ?? 3;
  const seenTitles = new Set<string>();
  for (let i = items.length - 1; i >= 0; i--) { const k = items[i]!.title.toLowerCase(); if (seenTitles.has(k)) items.splice(i, 1); else seenTitles.add(k); }
  const byPriority = (a: Item, b: Item): number => rank(a) - rank(b) || (b.date ?? "").localeCompare(a.date ?? "");
  const picked = balance(
    [{ items: items.filter((i) => general.has(i.id)), min: MIN_GENERAL }, { items: items.filter((i) => !general.has(i.id)), min: MIN_STACK }],
    WORK_TOTAL,
    byPriority,
  );
  return { items: picked, warnings };
};
