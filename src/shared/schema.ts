import { z } from "zod";

export const SECTION_IDS = ["notes", "meetings", "email", "work", "world", "chess", "wakeup"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
/** Sections whose items are news/security: every item needs a source link and a date (or `unverified`). */
export const SOURCED: readonly SectionId[] = ["work", "world"];

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const ItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  url: z.string().url().optional(),
  date: z.string().optional(), // ISO date or datetime of the source item
  start: z.string().optional(), // ISO datetime (meetings)
  source: z.string().optional(),
  tag: z.string().optional(), // e.g. "security", "release", "awaiting-reply"
  unverified: z.boolean().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const PuzzleSchema = z.object({
  id: z.string(),
  theme: z.string(),
  url: z.string().url(),
  themes: z.array(z.string()).default([]),
});
export type Puzzle = z.infer<typeof PuzzleSchema>;

export const SectionSchema = z
  .object({
    id: z.enum(SECTION_IDS),
    title: z.string(),
    status: z.enum(["ok", "error", "not_configured"]),
    message: z.string().optional(), // error text or "how to configure"
    warnings: z.array(z.string()).default([]),
    items: z.array(ItemSchema).default([]),
    puzzle: PuzzleSchema.optional(),
  })
  .superRefine((s, ctx) => {
    if (!SOURCED.includes(s.id)) return;
    s.items.forEach((item, i) => {
      if (item.unverified) return;
      if (!item.url || !item.date) {
        ctx.addIssue({ code: "custom", path: ["items", i], message: "news/security item needs url and date, or unverified:true" });
      }
    });
  });
export type Section = z.infer<typeof SectionSchema>;

export const BriefingSchema = z.object({
  date: dateStr,
  generatedAt: z.string(),
  sample: z.boolean().optional(),
  sections: z.array(SectionSchema).refine(
    (secs) => secs.map((s) => s.id).join() === SECTION_IDS.join(),
    "sections must be all seven, in the fixed order",
  ),
});
export type Briefing = z.infer<typeof BriefingSchema>;

// API inputs
export const FeedbackInput = z.object({
  kind: z.enum(["up", "down"]),
  target: z.enum(["source", "topic"]),
  value: z.string().trim().min(1).max(200).regex(/^[^\n\r]+$/),
});
export const PuzzleResultInput = z.object({
  puzzleId: z.string().min(1).max(64),
  theme: z.string().min(1).max(64).regex(/^[A-Za-z0-9]+$/),
  solved: z.boolean(),
});
export const NoteInput = z.object({ text: z.string().trim().min(1).max(20000) });

export const SECTION_TITLES: Record<SectionId, string> = {
  notes: "Yesterday's notes & open loops",
  meetings: "Today's meetings",
  email: "Email",
  work: "Job-critical",
  world: "World news",
  chess: "Brain teaser",
  wakeup: "15-minute wake-up",
};
