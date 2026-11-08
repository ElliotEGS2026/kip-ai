import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { work } from "../src/generator/collectors/work.js";

const now = new Date("2026-11-08T12:00:00Z");
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kip-work-"));
  process.env.KIP_DATA_DIR = path.join(dir, "data");
  process.env.KIP_CONFIG_DIR = path.join(dir, "config");
  fs.mkdirSync(process.env.KIP_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(dir, "config", "stack.md"), "- npm: react\n- gh: o/r\n");
  fs.writeFileSync(path.join(dir, "config", "sources.md"), "## Work news\n");
  fs.writeFileSync(path.join(dir, "config", "blocklist.md"), "## Outlets\n");
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.KIP_DATA_DIR; delete process.env.KIP_CONFIG_DIR; });

const atom = `<feed><entry><title>v2.0.0</title><link href="https://github.com/o/r/releases/tag/v2.0.0"/><updated>2026-11-07T10:00:00Z</updated></entry>
<entry><title>sub@1.0.0</title><link href="https://github.com/o/r/releases/tag/sub"/><updated>2026-11-07T10:00:00Z</updated></entry></feed>`;
const osv = { vulns: [
  { id: "GHSA-new-high", summary: "Bad bug", published: "2026-11-01T00:00:00Z", database_specific: { severity: "HIGH" } },
  { id: "GHSA-old", summary: "Old", published: "2026-01-01T00:00:00Z", database_specific: { severity: "CRITICAL" } },
  { id: "GHSA-low", summary: "Low", published: "2026-11-01T00:00:00Z", database_specific: { severity: "LOW" } },
] };
const mock = (npmVersion: string, osvOk = true) => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
  if (url.includes("releases.atom")) return new Response(atom);
  if (url.includes("registry.npmjs.org")) return new Response(JSON.stringify({ version: npmVersion }));
  if (url.includes("api.osv.dev")) return osvOk ? new Response(JSON.stringify(osv)) : new Response("no", { status: 500 });
  throw new Error("unexpected " + url);
}));

describe("work section", () => {
  it("reports recent high advisories and main-project releases only; every item has link+date", async () => {
    mock("19.0.0");
    const r = await work({ today: "2026-11-08", now });
    expect(r.items?.map((i) => i.id).sort()).toEqual(["GHSA-new-high", "https://github.com/o/r/releases/tag/v2.0.0"]);
    expect(r.items?.every((i) => i.url && i.date)).toBe(true);
  });
  it("names the project on release items and shows its repo as the source", async () => {
    mock("19.0.0");
    const r = await work({ today: "2026-11-08", now });
    const rel = r.items?.find((i) => i.url?.includes("/releases/tag/v2.0.0"));
    expect(rel?.title).toBe("o/r v2.0.0");
    expect(rel?.source).toBe("github.com/o/r");
  });
  it("keeps release-note bullet points readable", async () => {
    const { excerpt } = await import("../src/generator/feed.js");
    expect(excerpt("<h2>What's changed</h2><ul><li>Added a thing</li><li>Fixed a bug</li></ul>")).toBe("What's changed • Added a thing • Fixed a bug");
  });
  it("detects a major bump only after the baseline run", async () => {
    mock("19.0.0");
    await work({ today: "2026-11-08", now }); // baseline
    mock("20.1.0");
    const r = await work({ today: "2026-11-09", now });
    expect(r.items?.find((i) => i.title.includes("19.0.0 → 20.1.0"))).toBeTruthy();
  });
  it("a failing sub-source becomes a warning, not a failure", async () => {
    mock("19.0.0", false);
    const r = await work({ today: "2026-11-08", now });
    expect(r.status).toBeUndefined();
    expect(r.warnings?.some((w) => w.includes("OSV answered 500"))).toBe(true);
    expect(r.items?.length).toBeGreaterThan(0);
  });
  it("errors only when every source fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await work({ today: "2026-11-08", now })).status).toBe("error");
  });
});
