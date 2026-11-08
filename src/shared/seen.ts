import fs from "node:fs";
import path from "node:path";
import { addDays } from "./dates.js";
import { dataDir } from "./paths.js";
import { localDate } from "./dates.js";

/** Which news/release items you have already looked at: item id -> the day you saw it. Stored in data/seen.json. */
const seenFile = (): string => path.join(dataDir(), "seen.json");
const MAX_SEEN = 3000;

export function readSeen(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(seenFile(), "utf8")) as Record<string, string>; } catch { return {}; }
}

export function markSeen(ids: string[], today: string): void {
  const all = readSeen();
  for (const id of ids) all[id] ??= today; // keep the first day it was seen
  const keys = Object.keys(all);
  if (keys.length > MAX_SEEN) for (const k of keys.slice(0, keys.length - MAX_SEEN)) delete all[k];
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(seenFile(), JSON.stringify(all, null, 2));
}

/** Yesterday's date (YYYY-MM-DD) relative to a YYYY-MM-DD "today". */
export const yesterdayOf = (today: string): string => localDate(addDays(new Date(`${today}T12:00:00`), -1));

/**
 * Where an item belongs in the running order:
 *  0 = fresh (today or yesterday) and not seen yet  -> top priority
 *  1 = not seen yet, but older
 *  2 = already seen                                 -> last
 */
export function seenTier(id: string, date: string | undefined, seen: Record<string, string>, today: string): 0 | 1 | 2 {
  if (seen[id]) return 2;
  return date && date.slice(0, 10) >= yesterdayOf(today) ? 0 : 1;
}
