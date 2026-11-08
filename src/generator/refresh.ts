import type { Briefing, Section } from "../shared/schema.js";
import { notes } from "./collectors/notes.js";
import { buildToday } from "./collectors/today.js";
import { runSection } from "./run.js";

/**
 * Notes can be written after the morning generation. Rebuild the two sections that depend on them
 * (notes, and today's plan which includes open loops/priority notes) so a reload shows the latest.
 * Everything else (network data) is kept exactly as generated.
 */
export async function refreshNotes(b: Briefing, now: Date = new Date()): Promise<Briefing> {
  const ctx = { today: b.date, now };
  const freshNotes = await runSection("notes", notes, ctx);
  const sections: Section[] = b.sections.map((s) => (s.id === "notes" ? freshNotes : s));
  const plan = await runSection("today", async () => buildToday(sections), ctx);
  return { ...b, sections: sections.map((s) => (s.id === "today" ? plan : s)) };
}
