import type { Item } from "../shared/schema";

/** Notes share a page as bullet points; a page holds at most 5 notes / ~800 characters, then a new page starts. */
export function chunkNotes(items: Item[]): Item[][] {
  const pages: Item[][] = [];
  let cur: Item[] = [], chars = 0;
  for (const it of items) {
    const len = it.title.length + (it.summary?.length ?? 0);
    if (cur.length && (cur.length >= 5 || chars + len > 800)) { pages.push(cur); cur = []; chars = 0; }
    cur.push(it); chars += len;
  }
  if (cur.length) pages.push(cur);
  return pages;
}
