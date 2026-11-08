import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { world } from "../src/generator/collectors/world.js";

const now = new Date("2026-11-08T12:00:00Z");
let dir: string;

const SOURCES = `## Government & economy news
- https://g.test/economics/rss
- https://b.test/economy/rss

## Politics & finance news
- https://g.test/politics/rss
- https://b.test/politics/rss

## World news
- https://g.test/world/rss
- https://b.test/world/rss
`;

/** n fresh stories for one feed; `hoursAgo` staggers them so ordering is deterministic. */
const rss = (host: string, kind: string, n: number): string => `<rss><channel>${Array.from({ length: n }, (_, i) => `
<item><title>${host} ${kind} story ${i}</title><link>https://${host}.test/${kind}/${i}</link>
<pubDate>${new Date(now.getTime() - (i + 1) * 3600000).toUTCString()}</pubDate><description>About ${kind} ${i}</description></item>`).join("")}</channel></rss>`;

const stub = (counts: { economy: number; politics: number; world: number }) =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = new URL(url);
    const host = u.hostname.split(".")[0]!; // g | b
    const kind = u.pathname.includes("econom") ? "economy" : u.pathname.includes("politics") ? "politics" : "world";
    return new Response(rss(host, kind, counts[kind]));
  }));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kip-world-"));
  process.env.KIP_DATA_DIR = path.join(dir, "data");
  process.env.KIP_CONFIG_DIR = path.join(dir, "config");
  fs.mkdirSync(process.env.KIP_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(dir, "config", "sources.md"), SOURCES);
  fs.writeFileSync(path.join(dir, "config", "blocklist.md"), "## Outlets\n");
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.KIP_DATA_DIR; delete process.env.KIP_CONFIG_DIR; });

const tags = (items: { tag?: string }[] = []) => ({
  finance: items.filter((i) => i.tag === "finance").length,
  politics: items.filter((i) => i.tag === "politics").length,
  world: items.filter((i) => i.tag === "world").length,
});

describe("world news selection", () => {
  it("returns 10 with >=2 government/economy, >=4 politics+finance, >=3 world, from both outlets", async () => {
    stub({ economy: 5, politics: 5, world: 5 });
    const r = await world({ today: "2026-11-08", now });
    expect(r.items).toHaveLength(10);
    const t = tags(r.items);
    expect(t.finance).toBeGreaterThanOrEqual(2);
    expect(t.finance + t.politics).toBeGreaterThanOrEqual(4);
    expect(t.world).toBeGreaterThanOrEqual(3);
    expect(new Set(r.items?.map((i) => i.source))).toEqual(new Set(["g.test", "b.test"]));
    expect(r.warnings).toEqual([]);
  });

  it("holds the minimums even when one group is much busier", async () => {
    stub({ economy: 2, politics: 1, world: 30 });
    const t = tags((await world({ today: "2026-11-08", now })).items);
    expect(t.finance).toBeGreaterThanOrEqual(2);
    expect(t.finance + t.politics).toBeGreaterThanOrEqual(4);
  });

  it("warns when fewer than 2 government/economy stories exist", async () => {
    stub({ economy: 0, politics: 6, world: 6 });
    const r = await world({ today: "2026-11-08", now });
    expect(r.warnings?.join()).toContain("Only 0 government/economy stories");
    expect(r.items).toHaveLength(10);
  });

  it("ignores stories older than 48 hours", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<rss><channel><item><title>old</title><link>https://g.test/x</link><pubDate>${new Date(now.getTime() - 5 * 86400000).toUTCString()}</pubDate></item></channel></rss>`)));
    expect((await world({ today: "2026-11-08", now })).items).toEqual([]);
  });

  it("is an error card (not a crash) when every feed fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await world({ today: "2026-11-08", now })).status).toBe("error");
  });
});
