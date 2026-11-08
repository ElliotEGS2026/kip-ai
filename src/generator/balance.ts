export interface Group<T> { items: T[]; min: number }

/**
 * Picks up to `total` items: first each group's best `min` items, then the best of everything left,
 * so no group is crowded out. The result is ordered by `cmp` (priority).
 */
export function balance<T>(groups: Group<T>[], total: number, cmp: (a: T, b: T) => number): T[] {
  const sorted = groups.map((g) => [...g.items].sort(cmp));
  const picked = new Set<T>();
  sorted.forEach((items, i) => { for (const it of items.slice(0, groups[i]!.min)) picked.add(it); });
  const rest = sorted.flat().filter((it) => !picked.has(it)).sort(cmp);
  for (const it of rest) {
    if (picked.size >= total) break;
    picked.add(it);
  }
  return [...picked].sort(cmp).slice(0, total);
}
