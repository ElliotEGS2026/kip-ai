import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { BriefingSchema, FeedbackInput, NoteEditInput, NoteInput, PuzzleResultInput, SeenInput, dateStr } from "../shared/schema.js";
import { addBullet, hostOf } from "../shared/mdConfig.js";
import { dataDir, fixturePath, webDist } from "../shared/paths.js";
import { localDate } from "../shared/dates.js";
import { markSeen, readSeen } from "../shared/seen.js";
import { readChess, recordResult } from "../shared/chessState.js";
import type { Outcome } from "../shared/schema.js";
import { NoteStateInput, editNote, readNoteText, setNoteState } from "../shared/notes.js";
import { refreshNotes } from "../generator/refresh.js";
import { guard, type Guard } from "./security.js";
import { registerMicrosoft } from "./microsoftRoutes.js";

export interface AppOptions extends Guard { onShutdown: () => void }

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".map": "application/json",
};

/** Marks news/release items you have already looked at, so the page can show it. Order is NOT changed here (the slide you are on must not jump). */
function flagSeen<T extends { sections: { id: string; items: { id: string; seen?: boolean }[] }[] }>(b: T): T {
  const seen = readSeen();
  for (const s of b.sections) if (s.id === "work" || s.id === "world") for (const i of s.items) if (seen[i.id]) i.seen = true;
  return b;
}

/** Fills in how today's puzzles went (if answered), so the page can show it when you come back to them. */
function flagPuzzles<T extends { date: string; sections: { id: string; puzzle?: { id: string; result?: Outcome }; puzzles?: { id: string; result?: Outcome }[] }[] }>(b: T): T {
  const done = new Map(readChess().history.filter((h) => h.date === b.date).map((h) => [h.puzzleId, h.outcome ?? (h.solved ? "solved" : "missed")] as const));
  for (const s of b.sections) if (s.id === "chess") for (const p of [...(s.puzzles ?? []), ...(s.puzzle ? [s.puzzle] : [])]) { const r = done.get(p.id); if (r) p.result = r; }
  return b;
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", guard(opts));
  app.addHook("onSend", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  });

  app.get("/api/brief/:date", async (req, reply) => {
    const date = dateStr.safeParse((req.params as { date: string }).date);
    if (!date.success) return reply.code(400).send({ error: "bad date" });
    const file = path.join(dataDir(), "briefings", `${date.data}.json`);
    if (fs.existsSync(file)) {
      const parsed = BriefingSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
      if (!parsed.success) return reply.code(500).send({ error: "stored briefing failed validation" });
      // Today's notes may have been written after the morning generation: rebuild the note-dependent sections.
      return flagPuzzles(flagSeen(date.data === localDate() ? await refreshNotes(parsed.data) : parsed.data));
    }
    if (date.data === localDate()) {
      return flagPuzzles(flagSeen({ ...JSON.parse(fs.readFileSync(fixturePath(), "utf8")), date: date.data, sample: true }));
    }
    return reply.code(404).send({ error: "no briefing for that date" });
  });

  app.post("/api/feedback", async (req, reply) => {
    const body = FeedbackInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid input" });
    const { kind, target, value } = body.data;
    const v = target === "source" ? (hostOf(value) || value.toLowerCase()) : value.toLowerCase();
    const [file, section] =
      target === "source" ? (kind === "down" ? ["blocklist.md", "Outlets"] : ["sources.md", "Favourites"])
                          : (kind === "down" ? ["blocklist.md", "Topics"] : ["sources.md", "Favourite topics"]);
    return { added: addBullet(file, section, v), file, section, value: v };
  });

  /** The page reports news/release items you have looked at; tomorrow's brief ranks unread fresh items first. */
  app.post("/api/seen", async (req, reply) => {
    const body = SeenInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid input" });
    markSeen(body.data.ids, localDate());
    return { ok: true };
  });

  app.post("/api/puzzle-result", async (req, reply) => {
    const body = PuzzleResultInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid input" });
    const { puzzleId, theme, outcome, solved, seconds, index } = body.data;
    const s = recordResult(puzzleId, theme, outcome ?? (solved ? "solved" : "missed"), { ...(seconds !== undefined ? { seconds } : {}), ...(index !== undefined ? { index } : {}) });
    return { themes: s.themes };
  });
  app.get("/api/puzzle-stats", async () => readChess());

  app.get("/api/notes", async () => {
    const dir = path.join(dataDir(), "notes");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().slice(-7).reverse()
      .map((f) => ({ date: f.slice(0, 10), text: fs.readFileSync(path.join(dir, f), "utf8") }));
  });
  app.post("/api/notes", async (req, reply) => {
    const body = NoteInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid input" });
    const dir = path.join(dataDir(), "notes");
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    fs.appendFileSync(path.join(dir, `${localDate(now)}.md`), `### ${hhmm}\n${body.data.text}\n\n`);
    return { ok: true };
  });

  /** Read / replace one saved note's text (the notes page's Edit button). */
  app.get("/api/notes/:id", async (req, reply) => {
    const text = /^[a-f0-9]{12}$/.test((req.params as { id: string }).id) ? readNoteText((req.params as { id: string }).id) : null;
    return text === null ? reply.code(404).send({ error: "no such note" }) : { text };
  });
  app.post("/api/notes/edit", async (req, reply) => {
    const body = NoteEditInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid input" });
    const id = editNote(body.data.id, body.data.text);
    return id ? { id } : reply.code(404).send({ error: "no such note" });
  });

  /** Per-note choices: completed (off by default) and priority. Stored in data/note-state.json. */
  app.post("/api/notes/state", async (req, reply) => {
    const body = NoteStateInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid input" });
    const { id, ...patch } = body.data;
    return setNoteState(id, patch);
  });

  registerMicrosoft(app);

  app.post("/api/shutdown", async (_req, reply) => {
    void reply.send({ ok: true });
    setImmediate(opts.onShutdown);
    return reply;
  });

  // Built React app. index.html gets the per-run token injected.
  app.get("/*", async (req, reply) => {
    const urlPath = decodeURIComponent((req.url.split("?")[0] ?? "/"));
    const root = webDist();
    let file = path.resolve(root, "." + (urlPath === "/" ? "/index.html" : urlPath));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    if (!fs.existsSync(file)) return reply.code(503).type("text/plain").send("Web app not built. Run: npm run build");
    const ext = path.extname(file);
    if (file.endsWith("index.html")) {
      return reply.type(MIME[".html"] ?? "text/html").send(fs.readFileSync(file, "utf8").replace("__KIP_TOKEN__", opts.token));
    }
    return reply.type(MIME[ext] ?? "application/octet-stream").send(fs.readFileSync(file));
  });

  return app;
}
