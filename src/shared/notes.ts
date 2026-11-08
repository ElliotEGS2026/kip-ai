import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { localDate } from "./dates.js";
import { dataDir } from "./paths.js";

export interface NoteEntry { id: string; date: string; time: string; text: string }
/**
 * What the user decided about a note. A note is NOT completed by default: it stays on the list until completed.
 * `seen`/`remind` are the previous version's fields, still understood so existing data keeps working.
 */
export interface NoteState {
  completed?: boolean;
  /** Local date (YYYY-MM-DD) the note was completed. A completed note is shown struck-out that day, then drops off. */
  completedAt?: string;
  priority?: boolean;
  /** Deleted by the user: hidden everywhere (the text stays in data/notes/). */
  deleted?: boolean;
  seen?: boolean;
  remind?: boolean;
}

export const NoteStateInput = z.object({
  id: z.string().regex(/^[a-f0-9]{12}$/),
  completed: z.boolean().optional(),
  priority: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

/** Completed = ticked by the user (or, for old data, previously looked at and not flagged "remind"). */
export const isCompleted = (s?: NoteState): boolean => s?.completed ?? (!!s?.seen && !s?.remind);

const notesDir = (): string => path.join(dataDir(), "notes");
const stateFile = (): string => path.join(dataDir(), "note-state.json");
const MAX_STATES = 2000;

export const noteId = (date: string, time: string, text: string): string =>
  crypto.createHash("sha1").update(`${date}|${time}|${text.trim()}`).digest("hex").slice(0, 12);

/** Every saved note ("### HH:MM" blocks in data/notes/DATE.md), newest first. */
export function readNoteEntries(): NoteEntry[] {
  const dir = notesDir();
  if (!fs.existsSync(dir)) return [];
  const out: NoteEntry[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort().reverse()) {
    const date = f.slice(0, 10);
    const parts = fs.readFileSync(path.join(dir, f), "utf8").split(/^### (\d{2}:\d{2})[ \t]*$/m);
    // split with a capture group => [preamble, time1, body1, time2, body2, ...]
    const entries: NoteEntry[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      const time = parts[i] ?? "", text = (parts[i + 1] ?? "").trim();
      if (text) entries.push({ id: noteId(date, time, text), date, time, text });
    }
    out.push(...entries.reverse());
  }
  return out;
}

export function readNoteState(): Record<string, NoteState> {
  try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")) as Record<string, NoteState>; } catch { return {}; }
}

export function setNoteState(id: string, patch: Pick<NoteState, "completed" | "priority" | "deleted">, now: Date = new Date()): NoteState {
  const all = readNoteState();
  const next: NoteState = { ...all[id], ...patch };
  if (patch.completed === true) next.completedAt = localDate(now);
  if (patch.completed === false) delete next.completedAt;
  all[id] = next;
  const keys = Object.keys(all);
  if (keys.length > MAX_STATES) for (const k of keys.slice(0, keys.length - MAX_STATES)) delete all[k];
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify(all, null, 2));
  return next;
}
