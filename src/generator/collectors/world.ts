import type { Item } from "../../shared/schema.js";
import { balance } from "../balance.js";
import { readSeen, seenTier } from "../../shared/seen.js";
import { entryHost, feedLabel, fetchFeed, type FeedEntry } from "../feed.js";
import { applyPrefs, loadPrefs } from "../filters.js";
import { NotConfigured, type Collector } from "../types.js";

export const WORLD_TOTAL = 10;
/** At least this many politics-or-finance stories (government/economy ones count towards it)... */
export const MIN_POLITICS_FINANCE = 4;
/** ...of which at least this many are government/economy money news (feeds under "Government & economy news"). */
export const MIN_GOV_FINANCE = 2;
export const MIN_WORLD = 3;

type Cat = "finance" | "politics" | "world";

/**
 * World news (10): >=4 politics/finance (>=2 of them government/economy), >=3 general world, then the
 * highest-priority remainder. A story's category comes from the feed it was published in, not from keywords.
 */
export const world: Collector = async ({ now, today }) => {
  const prefs = loadPrefs();
  const seenMap = readSeen();
  if (prefs.world.length + prefs.politics.length + prefs.economy.length === 0) {
    throw new NotConfigured("Add RSS feeds under “## World news”, “## Politics & finance news” and “## Government & economy news” in config/sources.md.");
  }
  const warnings: string[] = [];
  let failed = 0;
  const category = new Map<FeedEntry, Cat>();
  const financeUrls = new Set<string>(); // an economy story also carried by a business feed is still "finance"
  const urls = [
    ...prefs.economy.map((u) => ({ u, c: "finance" as Cat })),
    ...prefs.politics.map((u) => ({ u, c: "politics" as Cat })),
    ...prefs.world.map((u) => ({ u, c: "world" as Cat })),
  ];
  const lists = await Promise.all(urls.map(async ({ u, c }) => {
    try {
      const entries = await fetchFeed(u);
      // A feed that loads but holds nothing usually means it changed format or is blocking us: flag it rather than stay silent.
      if (entries.length === 0) warnings.push(`${feedLabel(u)}: the feed returned no articles (it may have changed or be blocked)`);
      const fresh = entries.filter((e) => now.getTime() - e.ms < 48 * 3600000);
      fresh.forEach((e) => { category.set(e, c); if (c === "finance") financeUrls.add(e.url); });
      return fresh;
    } catch (e) { failed++; warnings.push(`${feedLabel(u)}: ${(e as Error).message}`); return []; }
  }));
  if (failed === urls.length) return { status: "error", message: warnings[0], warnings };
  const cat = (e: FeedEntry): Cat => (financeUrls.has(e.url) ? "finance" : category.get(e) ?? "world");

  // Master priority order (favourites first, then newest), de-duplicated by link and by headline.
  const seen = new Set<string>();
  const master = applyPrefs(lists.flat(), prefs).filter((e) => {
    const keys = [e.url, e.title.toLowerCase()];
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
  // Priority = favourites/newest, but alternating between outlets so a prolific one (the Guardian)
  // can't crowd out the others (BBC): every outlet's best story ranks before any outlet's second.
  const perOutlet = new Map<string, number>();
  const turn = new Map<FeedEntry, number>();
  master.forEach((e) => {
    const h = entryHost(e);
    turn.set(e, perOutlet.get(h) ?? 0);
    perOutlet.set(h, (perOutlet.get(h) ?? 0) + 1);
  });
  // Unread fresh stories come first, then unread older ones, then stories you have already seen.
  const tier = (e: FeedEntry): number => seenTier(e.url, e.date, seenMap, today);
  const ranked = master.map((e, i) => ({ e, i })).sort((a, b) => tier(a.e) - tier(b.e) || turn.get(a.e)! - turn.get(b.e)! || a.i - b.i);
  const order = new Map(ranked.map(({ e }, i) => [e, i] as const));

  const finance = master.filter((e) => cat(e) === "finance");
  const politics = master.filter((e) => cat(e) === "politics");
  const general = master.filter((e) => cat(e) === "world");
  // politics+finance minimum = guaranteed finance picks + the rest of the minimum from ordinary politics
  const politicsMin = MIN_POLITICS_FINANCE - Math.min(MIN_GOV_FINANCE, finance.length);
  const picked = balance(
    [{ items: finance, min: MIN_GOV_FINANCE }, { items: politics, min: politicsMin }, { items: general, min: MIN_WORLD }],
    WORLD_TOTAL,
    (a, b) => order.get(a)! - order.get(b)!,
  );
  const financePicked = picked.filter((e) => cat(e) === "finance").length;
  if (financePicked < MIN_GOV_FINANCE) warnings.push(`Only ${financePicked} government/economy ${financePicked === 1 ? "story" : "stories"} found in the last 48h (wanted ${MIN_GOV_FINANCE}).`);
  const items: Item[] = picked.map((e) => ({
    id: e.url, title: e.title, url: e.url, date: e.date, summary: e.summary, tag: cat(e),
    source: entryHost(e),
  }));
  return { items, warnings };
};
