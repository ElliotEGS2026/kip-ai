import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../../shared/paths.js";
import { addDays, localDate } from "../../shared/dates.js";
import { isCompleted, readNoteEntries, readNoteState } from "../../shared/notes.js";
import type { Item } from "../../shared/schema.js";
import type { Collector } from "../types.js";
import { clip } from "../../shared/text.js";

const read = (date: string): string => {
  try { return fs.readFileSync(path.join(dataDir(), "notes", `${date}.md`), "utf8"); } catch { return ""; }
};

/**
 * Every note (including ones written today) that has NOT been completed, priority first then newest.
 * Notes are not completed by default, so they keep coming back until the user ticks them off.
 * A note completed TODAY stays visible (struck out, with a delete button) and drops off from tomorrow;
 * a deleted note is never shown. Plus unchecked "- [ ]" lines from the last 14 days that were never ticked off.
 */
export const notes: Collector = async ({ now, today }) => {
  const state = readNoteState();
  const shown = readNoteEntries()
    .filter((e) => e.date <= today && !state[e.id]?.deleted)
    .map((e) => ({ e, priority: !!state[e.id]?.priority, completed: isCompleted(state[e.id]), completedAt: state[e.id]?.completedAt }))
    .filter((x) => !x.completed || x.completedAt === today)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || Number(b.priority) - Number(a.priority) || (b.e.date + b.e.time).localeCompare(a.e.date + a.e.time));

  const items: Item[] = shown.map(({ e, priority, completed }) => {
    const [first = "", ...rest] = e.text.split("\n");
    const body = rest.join(" ").trim();
    return {
      id: e.id, title: clip(first.trim(), 160), summary: body ? clip(body, 500) : undefined, date: e.date,
      tag: priority ? "priority" : "note", priority, completed,
    };
  });

  const all = Array.from({ length: 14 }, (_, i) => localDate(addDays(now, -i))).map((d) => ({ d, t: read(d) }));
  const done = new Set(all.flatMap(({ t }) => [...t.matchAll(/^\s*- \[x\]\s+(.+)$/gim)].map((m) => (m[1] ?? "").trim().toLowerCase())));
  const seen = new Set<string>();
  for (const { d, t } of all) {
    for (const m of t.matchAll(/^\s*- \[ \]\s+(.+)$/gm)) {
      const task = (m[1] ?? "").trim();
      if (done.has(task.toLowerCase()) || seen.has(task.toLowerCase())) continue;
      seen.add(task.toLowerCase());
      items.push({ id: `loop-${items.length}`, title: clip(task, 140), tag: "open-loop", date: d });
    }
  }
  return { items };
};
