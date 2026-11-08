import { readSections, hostOf } from "../shared/mdConfig.js";
import type { FeedEntry } from "./feed.js";

export function loadPrefs() {
  const block = readSections("blocklist.md");
  const src = readSections("sources.md");
  return {
    blockedOutlets: (block["Outlets"] ?? []).map((s) => s.toLowerCase()),
    blockedTopics: (block["Topics"] ?? []).map((s) => s.toLowerCase()),
    favOutlets: (src["Favourites"] ?? []).map((s) => s.toLowerCase()),
    favTopics: (src["Favourite topics"] ?? []).map((s) => s.toLowerCase()),
    work: src["Work news"] ?? [],
    platform: src["Platform news"] ?? [],
    world: src["World news"] ?? [],
    politics: src["Politics & finance news"] ?? [],
    economy: src["Government & economy news"] ?? [],
  };
}
export type Prefs = ReturnType<typeof loadPrefs>;

const domainMatch = (host: string, d: string): boolean => host === d || host.endsWith(`.${d}`);

/** Drops blocked outlets/topics, ranks favourites first, then newest. */
export function applyPrefs(entries: FeedEntry[], p: Prefs): FeedEntry[] {
  const kept = entries.filter((e) => {
    const h = hostOf(e.url);
    return !p.blockedOutlets.some((d) => domainMatch(h, d)) && !p.blockedTopics.some((t) => e.title.toLowerCase().includes(t));
  });
  const score = (e: FeedEntry): number =>
    (p.favOutlets.some((d) => domainMatch(hostOf(e.url), d)) ? 2 : 0) + (p.favTopics.some((t) => e.title.toLowerCase().includes(t)) ? 1 : 0);
  return kept.sort((a, b) => score(b) - score(a) || b.ms - a.ms);
}
