import { describe, expect, it } from "vitest";
import { cleanUrl, entryHost, feedLabel, listPoints, parseFeed } from "../src/generator/feed.js";

describe("aggregator (Google News) entries", () => {
  const xml = (items: string) => `<rss><channel>${items}</channel></rss>`;
  const item = (title: string, extra = '<source url="https://www.moneysavingexpert.com">Money Saving Expert</source>') =>
    `<item><title>${title}</title><link>https://news.google.com/rss/articles/abc123?oc=5</link><pubDate>Sun, 08 Nov 2026 09:00:00 GMT</pubDate>${extra}</item>`;

  it("keeps the real publisher, drops the ' - Outlet' headline suffix, and skips number-only titles", () => {
    const entries = parseFeed(xml(item("Energy price cap to rise - Money Saving Expert") + item("11621 - Money Saving Expert")));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "Energy price cap to rise", outlet: "Money Saving Expert", via: "https://www.moneysavingexpert.com" });
    expect(entryHost(entries[0]!)).toBe("moneysavingexpert.com");
  });

  it("an ordinary feed entry is unaffected", () => {
    const [e] = parseFeed(xml(item("Plain story", "")));
    expect(e?.outlet).toBeUndefined();
    expect(entryHost(e!)).toBe("news.google.com");
  });

  it("names a feed readably, including a search feed's terms", () => {
    expect(feedLabel("https://news.google.com/rss/search?q=site:moneysavingexpert.com+when:2d&hl=en-GB")).toBe("news.google.com/rss/search [site:moneysavingexpert.com when:2d]");
    expect(feedLabel("https://www.bbc.co.uk/news/rss.xml")).toBe("bbc.co.uk/news/rss.xml");
  });
});

describe("links point at the exact page", () => {
  it("removes tracking parameters but keeps real ones", () => {
    expect(cleanUrl("https://www.bbc.co.uk/news/articles/c617kjqjvk12o?at_medium=RSS&at_campaign=rss")).toBe("https://www.bbc.co.uk/news/articles/c617kjqjvk12o");
    expect(cleanUrl("https://example.com/a?id=7&utm_source=x&ocid=y")).toBe("https://example.com/a?id=7");
    expect(cleanUrl("not a url")).toBe("not a url");
  });

  it("keeps each release-note bullet with its own pull request link (pull > issue > commit)", () => {
    const html = '<h3>Bug Fixes</h3><ul>'
      + '<li>await close calls (<a href="https://github.com/o/r/pull/12">#12</a>) (<a href="https://github.com/o/r/commit/abc1234">abc1234</a>)</li>'
      + '<li>only a commit (<a href="https://github.com/o/r/commit/def5678">def5678</a>)</li>'
      + '<li>no links at all</li></ul>';
    expect(listPoints(html)).toEqual([
      { text: "await close calls", url: "https://github.com/o/r/pull/12" },
      { text: "only a commit", url: "https://github.com/o/r/commit/def5678" },
      { text: "no links at all" },
    ]);
    expect(listPoints("<ul>" + "<li>x</li>".repeat(20) + "</ul>")).toHaveLength(8);
  });

  it("parseFeed returns the cleaned article link and the linked bullets", () => {
    const body = '<ul><li>fix thing (<a href="https://github.com/o/r/pull/9">#9</a>)</li></ul>'.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const xml = '<feed><entry><title>v1.2.3</title><link href="https://github.com/o/r/releases/tag/v1.2.3?utm_source=feed"/><updated>2026-11-07T10:00:00Z</updated><content type="html">' + body + '</content></entry></feed>';
    const [e] = parseFeed(xml);
    expect(e?.url).toBe("https://github.com/o/r/releases/tag/v1.2.3");
    expect(e?.points).toEqual([{ text: "fix thing", url: "https://github.com/o/r/pull/9" }]);
  });
});
