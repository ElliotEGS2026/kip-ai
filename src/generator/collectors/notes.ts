import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../../shared/paths.js";
import { addDays, localDate } from "../../shared/dates.js";
import type { Item } from "../../shared/schema.js";
import type { Collector } from "../types.js";

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const read = (date: string): string => {
  try { return fs.readFileSync(path.join(dataDir(), "notes", `${date}.md`), "utf8"); } catch { return ""; }
};

/** Yesterday's entries plus unchecked "- [ ]" lines from the last 14 days that were never ticked off. */
export const notes: Collector = async ({ now }) => {
  const items: Item[] = [];
  const yesterday = localDate(addDays(now, -1));
  const entries = read(yesterday).split(/^### .*$/m).map((e) => e.trim()).filter(Boolean);
  entries.forEach((e, i) => {
    const [first = "", ...rest] = e.split("\n");
    items.push({ id: `note-${i}`, title: clip(first, 140), summary: rest.join(" ").trim() ? clip(rest.join(" ").trim(), 200) : undefined, date: yesterday });
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
