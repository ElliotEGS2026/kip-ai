import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generate, pruneOld, COLLECTORS } from "../src/generator/run.js";
import { parseFeed } from "../src/generator/feed.js";
import { balance } from "../src/generator/balance.js";
import { applyPrefs } from "../src/generator/filters.js";
import { parseIcs, prepLine } from "../src/generator/collectors/ics.js";
import { stackFromText, classify, WIDESPREAD } from "../src/generator/collectors/work.js";
import { notes } from "../src/generator/collectors/notes.js";
import { readNoteEntries, setNoteState } from "../src/shared/notes.js";
import { buildToday } from "../src/generator/collectors/today.js";
import { chunkNotes } from "../src/web/notesPaging.js";
import { THEMES, pickTheme, recordResult, readChess, seeded, weight } from "../src/shared/chessState.js";
import { localDate, addDays } from "../src/shared/dates.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kip-gen-"));
  process.env.KIP_DATA_DIR = path.join(dir, "data");
  process.env.KIP_CONFIG_DIR = path.join(dir, "config");
  fs.mkdirSync(process.env.KIP_CONFIG_DIR, { recursive: true });
});
afterEach(() => { delete process.env.KIP_DATA_DIR; delete process.env.KIP_CONFIG_DIR; });

describe("generation", () => {
  it("a failing section becomes an error card; the rest still render and validate", async () => {
    const boom = { ...COLLECTORS, work: async () => { throw new Error("source down"); }, world: async () => ({ items: [{ id: "1", title: "t" }] }) };
    const b = await generate(new Date(), boom, async () => undefined);
    const by = Object.fromEntries(b.sections.map((s) => [s.id, s]));
    expect(by.work?.status).toBe("error");
    expect(by.work?.message).toBe("source down");
    expect(by.world?.status).toBe("error"); // news item without link/date is rejected, not shown
    expect(by.chess?.status).toBe("ok");
    expect(by.today?.status).toBe("ok");
    expect(by.today?.warnings.join()).toContain("Job-critical failed");
    expect(fs.existsSync(path.join(process.env.KIP_DATA_DIR!, "briefings", `${localDate()}.md`))).toBe(true);
  });
  it("prunes briefings older than 14 days", () => {
    const d = path.join(dir, "b"); fs.mkdirSync(d);
    const old = localDate(addDays(new Date(), -20)), recent = localDate(addDays(new Date(), -2));
    for (const day of [old, recent]) fs.writeFileSync(path.join(d, `${day}.json`), "{}");
    pruneOld(d, new Date());
    expect(fs.readdirSync(d)).toEqual([`${recent}.json`]);
  });
});

describe("parsers", () => {
  it("parses RSS and Atom, dropping undated/unlinked entries", () => {
    const rss = `<rss><channel><item><title>A</title><link>https://a.com/1</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item><item><title>No date</title><link>https://a.com/2</link></item></channel></rss>`;
    const atom = `<feed><entry><title>B</title><link href="https://b.com/x"/><updated>2026-11-03T10:00:00Z</updated></entry></feed>`;
    expect(parseFeed(rss).map((e) => e.title)).toEqual(["A"]);
    expect(parseFeed(atom)[0]).toMatchObject({ title: "B", url: "https://b.com/x", date: "2026-11-03" });
  });
  it("applies blocklist and favourites", () => {
    const e = (t: string, u: string, ms: number) => ({ title: t, url: u, date: "2026-11-01", ms });
    const out = applyPrefs([e("new", "https://bad.com/1", 3), e("old fav", "https://www.fav.com/1", 1), e("sport news", "https://ok.com/1", 2), e("fine", "https://ok.com/2", 4)],
      { blockedOutlets: ["bad.com"], blockedTopics: ["sport"], favOutlets: ["fav.com"], favTopics: [], work: [], platform: [], world: [], politics: [], economy: [] });
    expect(out.map((x) => x.title)).toEqual(["old fav", "fine"]);
  });
  it("blocked topics match whole words and phrases, not parts of words", () => {
    const e = (t: string, ms: number) => ({ title: t, url: `https://ok.com/${ms}`, date: "2026-11-01", ms });
    const out = applyPrefs([e("War in Sudan escalates", 1), e("Storm warning for Wales", 2), e("Rachel Reeves sets out budget", 3), e("Reeves-era policy", 4), e("Rachel   Reeves again", 5)],
      { blockedOutlets: [], blockedTopics: ["war", "rachel reeves"], favOutlets: [], favTopics: [], work: [], platform: [], world: [], politics: [], economy: [] });
    expect(out.map((x) => x.title).sort()).toEqual(["Reeves-era policy", "Storm warning for Wales"]);
  });
  it("classifies wide-spread changes and filters platform noise", () => {
    expect(classify("Node.js 27 is now available", undefined, "news")).toBe("major");
    expect(classify("v3.0.0", "BREAKING CHANGE: drops CJS", "release")).toBe("breaking");
    expect(classify("Malicious npm packages found", undefined, "news")).toBe("security");
    expect(classify("v2.1.4", "bug fixes", "release")).toBe("release");
    expect(WIDESPREAD.test("Copilot gets a new theme")).toBe(false);
    expect(WIDESPREAD.test("Node.js 27 released")).toBe(true);
  });
  it("feed entries carry a plain-text summary", () => {
    const xml = '<feed><entry><title>v1</title><link href="https://x.com/r"/><updated>2026-11-01T00:00:00Z</updated><content type="html">&lt;p&gt;Fixes &amp;amp; things&lt;/p&gt;</content></entry></feed>';
    expect(parseFeed(xml)[0]?.summary).toBe("Fixes & things");
  });
  it("balance guarantees group minimums, then fills by priority", () => {
    const cmp = (a: number, b: number) => a - b; // lower = higher priority
    const general = [5, 6, 7, 8, 9], stack = [1, 2, 3, 4, 20, 21];
    const out = balance([{ items: general, min: 3 }, { items: stack, min: 3 }], 8, cmp);
    expect(out).toHaveLength(8);
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // a group with few items cannot crowd out the other
    const lopsided = balance([{ items: [100, 101], min: 3 }, { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], min: 3 }], 10, cmp);
    expect(lopsided).toHaveLength(10);
    expect(lopsided).toContain(100);
    // minimums win over priority when the other group has better items
    expect(balance([{ items: [50, 51, 52], min: 3 }, { items: [1, 2, 3, 4], min: 0 }], 5, cmp)).toEqual([1, 2, 50, 51, 52].sort(cmp));
  });
  it("parses ICS (UTC, all-day, cancelled, folded lines)", () => {
    const ics = ["BEGIN:VEVENT", "UID:1", "DTSTART:20261108T093000Z", "SUMMARY:Stand\\, up", "ATTENDEE:mailto:a@x", "ATTENDEE:mailto:b@x", "DESCRIPTION:https://teams.microsoft.com/l/meetup", "END:VEVENT",
      "BEGIN:VEVENT", "UID:2", "DTSTART;VALUE=DATE:20261108", "SUMMARY:Holiday", "END:VEVENT", "BEGIN:VEVENT", "UID:3", "DTSTART:20261108T100000Z", "STATUS:CANCELLED", "SUMMARY:x", "END:VEVENT"].join("\r\n");
    const ev = parseIcs(ics);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ summary: "Stand, up", attendees: 2, online: true });
    expect(ev[1]?.allDay).toBe(true);
    expect(prepLine(ev[0]!)).toBe("Prep: 2 attendees, online");
  });
  it("reads the stack list", () => {
    expect(stackFromText("- npm: react\n- gh: a/b\nnote\n- npm: @x/y")).toEqual({ npm: ["react", "@x/y"], gh: ["a/b"] });
  });
});

describe("notes + chess", () => {
  it("shows yesterday's entries and only unticked open loops", async () => {
    const nd = path.join(process.env.KIP_DATA_DIR!, "notes"); fs.mkdirSync(nd, { recursive: true });
    const now = new Date();
    fs.writeFileSync(path.join(nd, `${localDate(addDays(now, -1))}.md`), "### 09:00\nMet client\n- [ ] send spec\n- [ ] book room\n\n");
    fs.writeFileSync(path.join(nd, `${localDate(now)}.md`), "- [x] book room\n");
    const r = await notes({ today: localDate(now), now });
    expect(r.items?.find((i) => i.tag === "note")?.title).toBe("Met client");
    const loops = r.items?.filter((i) => i.tag === "open-loop").map((i) => i.title);
    expect(loops).toEqual(["send spec"]);
  });
  it("notes are NOT completed by default: all stay listed (priority first) until completed", async () => {
    const nd = path.join(process.env.KIP_DATA_DIR!, "notes"); fs.mkdirSync(nd, { recursive: true });
    const now = new Date();
    const d = (n: number) => localDate(addDays(now, -n));
    fs.writeFileSync(path.join(nd, `${d(1)}.md`), "### 09:00\nfresh note\n\n### 10:00\ndone note\n\n");
    fs.writeFileSync(path.join(nd, `${d(3)}.md`), "### 08:00\nlegacy remind note\n\n### 09:30\nprio note\nmore detail\n\n### 11:00\nlegacy addressed note\n\n");
    fs.writeFileSync(path.join(nd, `${d(20)}.md`), "### 07:00\nancient but priority\n\n### 07:30\nancient uncompleted\n\n");
    fs.writeFileSync(path.join(nd, `${localDate(now)}.md`), "### 07:00\ntoday's note\n\n");
    const id = Object.fromEntries(readNoteEntries().map((e) => [e.text.split("\n")[0], e.id])) as Record<string, string>;
    setNoteState(id["done note"]!, { completed: true });
    setNoteState(id["prio note"]!, { priority: true });
    setNoteState(id["ancient but priority"]!, { priority: true });
    // state written by the previous version still behaves: seen = addressed, seen + remind = still open
    fs.writeFileSync(path.join(process.env.KIP_DATA_DIR!, "note-state.json"), JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(process.env.KIP_DATA_DIR!, "note-state.json"), "utf8")),
      [id["legacy addressed note"]!]: { seen: true },
      [id["legacy remind note"]!]: { seen: true, remind: true },
    }));
    const r = await notes({ today: localDate(now), now });
    const titles = (r.items ?? []).filter((i) => i.tag !== "open-loop").map((i) => i.title);
    // open notes first (priority, then newest); a note completed today is still listed, last, struck out
    expect(titles).toEqual(["prio note", "ancient but priority", "today's note", "fresh note", "legacy remind note", "ancient uncompleted", "done note"]);
    expect(r.items?.find((i) => i.title === "done note")).toMatchObject({ completed: true });
    expect(titles).not.toContain("legacy addressed note");
    expect(r.items?.find((i) => i.title === "prio note")).toMatchObject({ tag: "priority", priority: true, summary: "more detail" });
    expect(r.items?.find((i) => i.title === "fresh note")).toMatchObject({ tag: "note", priority: false });
  });
  it("a completed note stays struck out today, is gone tomorrow; un-completing restores it", async () => {
    const nd = path.join(process.env.KIP_DATA_DIR!, "notes"); fs.mkdirSync(nd, { recursive: true });
    const now = new Date(), tomorrow = addDays(now, 1);
    fs.writeFileSync(path.join(nd, `${localDate(now)}.md`), "### 07:00\none thing\n\n");
    const [e] = readNoteEntries();
    const run = (d: Date) => notes({ today: localDate(d), now: d });
    expect((await run(now)).items).toMatchObject([{ title: "one thing", completed: false }]);
    expect(setNoteState(e!.id, { completed: true }, now).completedAt).toBe(localDate(now));
    expect((await run(now)).items).toMatchObject([{ title: "one thing", completed: true }]); // still there, struck out
    expect((await run(tomorrow)).items).toHaveLength(0); // dropped off by default the next day
    expect(setNoteState(e!.id, { completed: false }, now).completedAt).toBeUndefined();
    expect((await run(tomorrow)).items).toHaveLength(1); // not completed => keeps coming back
  });
  it("a deleted note is never shown (the text stays on disk)", async () => {
    const nd = path.join(process.env.KIP_DATA_DIR!, "notes"); fs.mkdirSync(nd, { recursive: true });
    const now = new Date();
    fs.writeFileSync(path.join(nd, `${localDate(now)}.md`), "### 07:00\nkeep me\n\n### 08:00\ndelete me\n\n");
    const byText = Object.fromEntries(readNoteEntries().map((e) => [e.text, e.id]));
    setNoteState(byText["delete me"]!, { completed: true, deleted: true }, now);
    expect((await notes({ today: localDate(now), now })).items?.map((i) => i.title)).toEqual(["keep me"]);
    expect(fs.readFileSync(path.join(nd, `${localDate(now)}.md`), "utf8")).toContain("delete me");
  });
  it("notes share pages: up to 5 per page, long ones split sooner", () => {
    const mk = (n: number, len = 10) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, title: "x".repeat(len) }));
    expect(chunkNotes(mk(3)).map((p) => p.length)).toEqual([3]);
    expect(chunkNotes(mk(12)).map((p) => p.length)).toEqual([5, 5, 2]);
    expect(chunkNotes(mk(4, 400)).map((p) => p.length)).toEqual([2, 2]);
    expect(chunkNotes([])).toEqual([]);
  });
  it("priority notes appear first in today's plan", () => {
    const sec = (id: string, items: object[]) => ({ id, title: id, status: "ok", warnings: [], items }) as never;
    const r = buildToday([sec("notes", [{ id: "a", title: "Loop", tag: "open-loop" }, { id: "b", title: "Big one", tag: "priority", priority: true }])]);
    expect(r.items?.map((i) => i.title)).toEqual(["⭐ Big one", "Loop"]);
  });
  it("missed themes get picked more often", () => {
    for (let i = 0; i < 5; i++) recordResult(`p${i}`, "fork", false);
    for (let i = 0; i < 5; i++) recordResult(`q${i}`, "pin", true);
    const s = readChess();
    expect(weight(s.themes.fork)).toBeGreaterThan(weight(s.themes.pin));
    let fork = 0, pin = 0;
    const rand = seeded("x"), N = 4000, uniform = 1 / THEMES.length;
    for (let i = 0; i < N; i++) { const t = pickTheme(s, rand()); if (t === "fork") fork++; if (t === "pin") pin++; }
    expect(fork / N).toBeGreaterThan(2 * uniform); // missed theme: more than double the uniform share
    expect(pin / N).toBeLessThan(uniform / 2); // mastered theme: well under half
  });
  it("today's plan is built only from real items in other sections", () => {
    const sec = (id: string, items: object[], status = "ok") => ({ id, title: id, status, warnings: [], items }) as never;
    const r = buildToday([
      sec("meetings", [{ id: "m", title: "Standup", start: "2026-11-08T09:00:00Z" }]),
      sec("notes", [{ id: "a", title: "Ship it", tag: "open-loop" }, { id: "b", title: "just a note" }]),
      sec("email", [{ id: "e", title: "Quote", tag: "awaiting-reply" }, { id: "f", title: "FYI", tag: "unread" }]),
      sec("work", [{ id: "w", title: "x" }, { id: "w2", title: "y" }]),
    ]);
    expect(r.items?.map((i) => i.tag)).toEqual(["meeting", "task", "reply", "review"]);
    expect(r.items?.[3]?.title).toBe("Review 2 job-critical updates");
    expect(buildToday([]).items).toEqual([]);
  });
});
