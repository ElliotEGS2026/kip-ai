import { XMLParser } from "fast-xml-parser";
import { fetchT } from "./net.js";

export interface FeedEntry { title: string; url: string; date: string; ms: number }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => (typeof v === "object" && v !== null ? String((v as Record<string, unknown>)["#text"] ?? "") : String(v ?? "")).trim();

/** Parses RSS 2.0 and Atom. Entries without a valid link or date are dropped (we can't source them). */
export function parseFeed(xml: string): FeedEntry[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const raw: { title: string; link: string; when: string }[] = [
    ...arr<any>(doc.rss?.channel?.item).map((i) => ({ title: text(i.title), link: text(i.link), when: text(i.pubDate ?? i["dc:date"]) })),
    ...arr<any>(doc.feed?.entry).map((e) => {
      const links = arr<any>(e.link);
      const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      return { title: text(e.title), link: String(alt?.["@_href"] ?? ""), when: text(e.updated ?? e.published) };
    }),
  ];
  const out: FeedEntry[] = [];
  for (const r of raw) {
    const ms = Date.parse(r.when);
    if (!r.title || !/^https?:\/\//.test(r.link) || Number.isNaN(ms)) continue;
    out.push({ title: r.title, url: r.link, date: new Date(ms).toISOString().slice(0, 10), ms });
  }
  return out;
}

export async function fetchFeed(url: string): Promise<FeedEntry[]> {
  const r = await fetchT(url);
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return parseFeed(await r.text());
}
