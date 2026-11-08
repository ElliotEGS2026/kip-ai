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
