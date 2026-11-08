import type { Item, Section } from "../../shared/schema.js";
import type { Result } from "../types.js";

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * "Today's plan": next steps derived ONLY from the other sections' real items (nothing invented).
 * Runs after the other collectors, so it never fetches anything itself.
 */
export function buildToday(sections: Section[]): Result {
  const by = (id: string): Section | undefined => sections.find((s) => s.id === id);
  const items: Item[] = [];
  const warnings: string[] = [];
  const usable = (id: string, label: string): Section | undefined => {
    const s = by(id);
    if (s?.status === "ok") return s;
    if (s?.status === "error") warnings.push(`${label} failed, so it is missing from this plan.`);
    return undefined;
  };

  for (const m of usable("meetings", "Meetings")?.items ?? []) {
    items.push({ id: `plan-m-${items.length}`, title: m.title, summary: m.summary, start: m.start, tag: "meeting" });
  }
  for (const n of (usable("notes", "Notes")?.items ?? []).filter((i) => i.tag === "open-loop")) {
    items.push({ id: `plan-t-${items.length}`, title: clip(n.title, 140), date: n.date, tag: "task" });
  }
  for (const e of (usable("email", "Email")?.items ?? []).filter((i) => i.tag === "awaiting-reply")) {
    items.push({ id: `plan-r-${items.length}`, title: `Reply: ${clip(e.title, 120)}`, summary: e.summary, url: e.url, date: e.date, tag: "reply" });
  }
  const work = usable("work", "Job-critical")?.items ?? [];
  if (work.length) items.push({ id: `plan-w-${items.length}`, title: `Review ${work.length} job-critical update${work.length === 1 ? "" : "s"}`, tag: "review" });

  return { items, warnings };
}
