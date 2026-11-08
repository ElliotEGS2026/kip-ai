import { XMLParser } from "fast-xml-parser";
import { hostOf } from "../shared/mdConfig.js";
import { fetchT } from "./net.js";

export interface Point { text: string; url?: string }
export interface FeedEntry { title: string; url: string; date: string; ms: number; summary?: string; points?: Point[];
  /** Aggregator feeds (Google News) link through their own address: who really published it, and where. */
  outlet?: string; via?: string }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => (typeof v === "object" && v !== null ? String((v as Record<string, unknown>)["#text"] ?? "") : String(v ?? "")).trim();

/** Plain-text excerpt of an HTML/markup blob (release notes, descriptions). */
export function excerpt(html: string, max = 600): string {
  const t = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h[1-6][^>]*>/gi, " ▸ ")
    .replace(/<li[^>]*>/gi, " • ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/(^|\s)#{1,6}\s+/g, "$1")
    .replace(/\(\s*(#\d+|[0-9a-f]{7,40})\s*\)/g, "") // "( #123 )" / "( abc1234 )" reference links add nothing here
    .replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** The site a story really belongs to: the original publisher when an aggregator links through itself. */
export const entryHost = (e: { url: string; via?: string }): string => hostOf(e.via ?? e.url);

/** A readable name for a feed in warnings: host + path, and the search terms for search feeds. */
export function feedLabel(url: string): string {
  try {
    const u = new URL(url), q = u.searchParams.get("q");
    return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname.slice(0, 40) : "") + (q ? ` [${q}]` : "");
  } catch { return url; }
}

/** Drops tracking parameters (?at_medium=RSS, utm_*, ...) so the link is the plain, shareable address of the article. */
export function cleanUrl(link: string): string {
  try {
    const u = new URL(link);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|at_|ocid$|cmpid$|fbclid$|gclid$|ref_src$)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch { return link; }
}

/** The bullet points of a release note, each with the pull request / issue / commit it links to (if the note has one). */
export function listPoints(html: string, max = 8): Point[] {
  const out: Point[] = [];
  for (const m of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const inner = m[1] ?? "";
    const text = excerpt(inner, 220);
    if (!text) continue;
    const hrefs = [...inner.matchAll(/href=["']([^"']+)["']/gi)].map((h) => h[1] ?? "").filter((h) => /^https?:\/\//.test(h));
    const url = hrefs.find((h) => /\/pull\//.test(h)) ?? hrefs.find((h) => /\/issues\//.test(h)) ?? hrefs.find((h) => /\/commit\//.test(h));
    out.push(url ? { text, url } : { text });
    if (out.length >= max) break;
  }
  return out;
}

/** Parses RSS 2.0 and Atom. Entries without a valid link or date are dropped (we can't source them). */
export function parseFeed(xml: string): FeedEntry[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const raw: { title: string; link: string; when: string; body: string; outlet?: string; via?: string }[] = [
    ...arr<any>(doc.rss?.channel?.item).map((i) => ({ title: text(i.title), link: text(i.link), when: text(i.pubDate ?? i["dc:date"]), body: text(i["content:encoded"] ?? i.description), outlet: text(i.source) || undefined, via: typeof i.source?.["@_url"] === "string" ? i.source["@_url"] : undefined })),
    ...arr<any>(doc.feed?.entry).map((e) => {
      const links = arr<any>(e.link);
      const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      return { title: text(e.title), link: String(alt?.["@_href"] ?? ""), when: text(e.updated ?? e.published), body: text(e.content ?? e.summary) };
    }),
  ];
  const out: FeedEntry[] = [];
  for (const r of raw) {
    const ms = Date.parse(r.when);
    if (!r.title || !/^https?:\/\//.test(r.link) || Number.isNaN(ms)) continue;
    const summary = excerpt(r.body), points = listPoints(r.body);
    // Aggregators append " - Outlet" to every headline; the outlet is shown separately.
    const title = r.outlet && r.title.endsWith(` - ${r.outlet}`) ? r.title.slice(0, -(r.outlet.length + 3)) : r.title;
    if (r.outlet && /^[\d\s]+$/.test(title)) continue; // aggregator entries titled with just a page number say nothing
    out.push({ title, url: cleanUrl(r.link), date: new Date(ms).toISOString().slice(0, 10), ms, ...(summary ? { summary } : {}), ...(points.length ? { points } : {}), ...(r.outlet ? { outlet: r.outlet } : {}), ...(r.via ? { via: r.via } : {}) });
  }
  return out;
}

export async function fetchFeed(url: string): Promise<FeedEntry[]> {
  const r = await fetchT(url);
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return parseFeed(await r.text());
}
