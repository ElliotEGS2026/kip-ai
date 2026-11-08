import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/server/app.js";
import { localDate } from "../src/shared/dates.js";

const PORT = 47999, TOKEN = "t".repeat(48);
const good = { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}`, "x-kip-token": TOKEN };
let dir: string, onShutdown: ReturnType<typeof vi.fn> & (() => void), app: ReturnType<typeof buildApp>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kip-test-"));
  process.env.KIP_DATA_DIR = path.join(dir, "data");
  process.env.KIP_CONFIG_DIR = path.join(dir, "config");
  fs.mkdirSync(process.env.KIP_CONFIG_DIR, { recursive: true });
  onShutdown = vi.fn() as typeof onShutdown;
  app = buildApp({ port: PORT, token: TOKEN, onShutdown });
});
afterEach(async () => { await app.close(); delete process.env.KIP_DATA_DIR; delete process.env.KIP_CONFIG_DIR; });

const post = (url: string, headers: Record<string, string>, payload: unknown = {}) =>
  app.inject({ method: "POST", url, headers: { "content-type": "application/json", ...headers }, payload: JSON.stringify(payload) });

describe("today's brief picks up notes written after generation", () => {
  it("includes a note saved today when the brief is loaded", async () => {
    const day = localDate();
    const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "briefing.sample.json"), "utf8"));
    fs.mkdirSync(path.join(process.env.KIP_DATA_DIR!, "briefings"), { recursive: true });
    fs.writeFileSync(path.join(process.env.KIP_DATA_DIR!, "briefings", `${day}.json`), JSON.stringify({ ...fixture, date: day, sample: undefined }));
    const before = await app.inject({ method: "GET", url: `/api/brief/${day}`, headers: good });
    expect(JSON.stringify(before.json())).not.toContain("written after generation");
    expect((await post("/api/notes", good, { text: "written after generation" })).statusCode).toBe(200);
    const after = (await app.inject({ method: "GET", url: `/api/brief/${day}`, headers: good })).json();
    const notes = after.sections.find((x: { id: string }) => x.id === "notes");
    expect(notes.items.map((i: { title: string }) => i.title)).toContain("written after generation");
    expect(after.sections.map((x: { id: string }) => x.id)).toHaveLength(7);
  });
});

describe("note state", () => {
  it("stores per-note choices and rejects bad ids", async () => {
    const ok = await post("/api/notes/state", good, { id: "abcdef012345", completed: true, priority: true });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(fs.readFileSync(path.join(process.env.KIP_DATA_DIR!, "note-state.json"), "utf8")).abcdef012345).toMatchObject({ completed: true, priority: true, completedAt: localDate() });
    expect((await post("/api/notes/state", good, { id: "../../etc", completed: true })).statusCode).toBe(400);
    const { "x-kip-token": _t, ...noToken } = good;
    expect((await post("/api/notes/state", noToken, { id: "abcdef012345" })).statusCode).toBe(403);
  });
});

describe("shutdown security", () => {
  it("rejects missing token", async () => {
    const { "x-kip-token": _t, ...h } = good;
    expect((await post("/api/shutdown", h)).statusCode).toBe(403);
    expect(onShutdown).not.toHaveBeenCalled();
  });
  it("rejects wrong token", async () => {
    expect((await post("/api/shutdown", { ...good, "x-kip-token": "x".repeat(48) })).statusCode).toBe(403);
  });
  it("rejects foreign Origin even with the right token", async () => {
    expect((await post("/api/shutdown", { ...good, origin: "https://evil.example" })).statusCode).toBe(403);
    expect(onShutdown).not.toHaveBeenCalled();
  });
  it("rejects a rebinding Host", async () => {
    expect((await post("/api/shutdown", { ...good, host: `evil.example:${PORT}` })).statusCode).toBe(403);
  });
  it("rejects non-JSON content types (form posts)", async () => {
    const r = await app.inject({ method: "POST", url: "/api/shutdown", headers: { ...good, "content-type": "text/plain" }, payload: "x" });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(onShutdown).not.toHaveBeenCalled();
  });
  it("accepts a valid request and shuts down", async () => {
    expect((await post("/api/shutdown", good)).statusCode).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(onShutdown).toHaveBeenCalledOnce();
  });
});

describe("api", () => {
  it("GET needs token and host too", async () => {
    expect((await app.inject({ url: `/api/brief/${localDate()}`, headers: { host: good.host } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/brief/${localDate()}`, headers: { host: good.host, "x-kip-token": TOKEN } })).statusCode).toBe(200);
  });
  it("serves the sample brief for today and 404 for other dates", async () => {
    const h = { host: good.host, "x-kip-token": TOKEN };
    expect(JSON.parse((await app.inject({ url: `/api/brief/${localDate()}`, headers: h })).body).sample).toBe(true);
    expect((await app.inject({ url: "/api/brief/2020-01-01", headers: h })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/brief/nope", headers: h })).statusCode).toBe(400);
  });
  it("feedback writes the blocklist; puzzle result updates stats", async () => {
    fs.writeFileSync(path.join(process.env.KIP_CONFIG_DIR!, "blocklist.md"), "## Outlets\n\n## Topics\n");
    const r = await post("/api/feedback", good, { kind: "down", target: "source", value: "https://www.Bad.com/x" });
    expect(JSON.parse(r.body).value).toBe("bad.com");
    expect(fs.readFileSync(path.join(process.env.KIP_CONFIG_DIR!, "blocklist.md"), "utf8")).toContain("- bad.com");
    await post("/api/puzzle-result", good, { puzzleId: "p1", theme: "fork", solved: false });
    const s = JSON.parse(fs.readFileSync(path.join(process.env.KIP_DATA_DIR!, "chess-weaknesses.json"), "utf8"));
    expect(s.themes.fork).toMatchObject({ attempts: 1, fails: 1 });
  });
  it("rejects invalid input", async () => {
    expect((await post("/api/feedback", good, { kind: "down", target: "source", value: "" })).statusCode).toBe(400);
  });
});

describe("editing a saved note", () => {
  const notesFile = (): string => path.join(process.env.KIP_DATA_DIR!, "notes", `${localDate()}.md`);
  const saved = async () => {
    await post("/api/notes", good, { text: "first note" });
    await post("/api/notes", good, { text: "second note" });
    const day = localDate();
    const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "briefing.sample.json"), "utf8"));
    fs.mkdirSync(path.join(process.env.KIP_DATA_DIR!, "briefings"), { recursive: true });
    fs.writeFileSync(path.join(process.env.KIP_DATA_DIR!, "briefings", `${day}.json`), JSON.stringify({ ...fixture, date: day, sample: undefined }));
    const b = (await app.inject({ method: "GET", url: `/api/brief/${day}`, headers: good })).json();
    return b.sections.find((x: { id: string }) => x.id === "notes").items as { id: string; title: string }[];
  };

  it("returns a note's text and replaces it in place, keeping its priority", async () => {
    const items = await saved();
    const first = items.find((i) => i.title === "first note")!;
    await post("/api/notes/state", good, { id: first.id, priority: true });
    expect((await app.inject({ method: "GET", url: `/api/notes/${first.id}`, headers: good })).json()).toEqual({ text: "first note" });
    const res = await post("/api/notes/edit", good, { id: first.id, text: "first note, edited\nwith detail" });
    expect(res.statusCode).toBe(200);
    const newId = res.json().id as string;
    expect(newId).not.toBe(first.id);
    const file = fs.readFileSync(notesFile(), "utf8");
    expect(file).toContain("first note, edited\nwith detail");
    expect(file).toContain("second note"); // the other note is untouched
    expect(file.match(/^### /gm)).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(path.join(process.env.KIP_DATA_DIR!, "note-state.json"), "utf8"))[newId]).toMatchObject({ priority: true });
  });

  it("rejects unknown notes, bad ids, empty text and missing tokens", async () => {
    expect((await post("/api/notes/edit", good, { id: "abcdef012345", text: "x" })).statusCode).toBe(404);
    expect((await post("/api/notes/edit", good, { id: "../../etc", text: "x" })).statusCode).toBe(400);
    const items = await saved();
    expect((await post("/api/notes/edit", good, { id: items[0]!.id, text: "   " })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/notes/abcdef012345", headers: good })).statusCode).toBe(404);
    const { "x-kip-token": _t, ...noToken } = good;
    expect((await post("/api/notes/edit", noToken, { id: items[0]!.id, text: "x" })).statusCode).toBe(403);
  });
});

describe("seen items", () => {
  const seenFile = (): string => path.join(process.env.KIP_DATA_DIR!, "seen.json");
  it("records seen ids, validates input, and flags them on the next brief (without reordering)", async () => {
    const day = localDate();
    const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "briefing.sample.json"), "utf8"));
    fs.mkdirSync(path.join(process.env.KIP_DATA_DIR!, "briefings"), { recursive: true });
    fs.writeFileSync(path.join(process.env.KIP_DATA_DIR!, "briefings", `${day}.json`), JSON.stringify({ ...fixture, date: day, sample: undefined }));
    expect((await post("/api/seen", good, { ids: ["w2"] })).statusCode).toBe(200);
    expect(JSON.parse(fs.readFileSync(seenFile(), "utf8"))).toEqual({ w2: day });
    const work = (await app.inject({ method: "GET", url: `/api/brief/${day}`, headers: good })).json().sections.find((x: { id: string }) => x.id === "work");
    expect(work.items.map((i: { id: string; seen?: boolean }) => [i.id, i.seen ?? false])).toEqual([["w1", false], ["w2", true]]);
    expect((await post("/api/seen", good, { ids: [] })).statusCode).toBe(400);
    expect((await post("/api/seen", good, { ids: [123] })).statusCode).toBe(400);
    const { "x-kip-token": _t, ...noToken } = good;
    expect((await post("/api/seen", noToken, { ids: ["w1"] })).statusCode).toBe(403);
  });
});
