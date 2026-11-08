import { fetchFeed } from "../feed.js";
import { applyPrefs, loadPrefs } from "../filters.js";
import { NotConfigured, type Collector } from "../types.js";

export const world: Collector = async ({ now }) => {
  const prefs = loadPrefs();
  if (prefs.world.length === 0) throw new NotConfigured("Add RSS feeds under “## World news” in config/sources.md.");
  const warnings: string[] = [];
  const lists = await Promise.all(prefs.world.map(async (url) => {
    try { return (await fetchFeed(url)).filter((e) => now.getTime() - e.ms < 48 * 3600000); }
    catch (e) { warnings.push((e as Error).message); return []; }
  }));
  if (warnings.length === prefs.world.length) return { status: "error", message: warnings[0], warnings };
  const seen = new Set<string>();
  const items = applyPrefs(lists.flat(), prefs).filter((e) => !seen.has(e.url) && !!seen.add(e.url)).slice(0, 8)
    .map((e) => ({ id: e.url, title: e.title, url: e.url, date: e.date, source: new URL(e.url).hostname.replace(/^www\./, "") }));
  return { items, warnings };
};
