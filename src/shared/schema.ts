import { z } from "zod";

export const SECTION_IDS = ["chess", "notes", "meetings", "email", "work", "world", "today"] as const;
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
  priority: z.boolean().optional(), // notes: user flagged as priority
  completed: z.boolean().optional(), // notes: completed today (shown struck out until tomorrow)
  points: z.array(z.object({ text: z.string(), url: z.string().url().optional() })).max(12).optional(), // release notes: each change, linked to its own pull request / commit
  seen: z.boolean().optional(), // news/releases: you have already looked at this (set when the brief is served)
});
export type Item = z.infer<typeof ItemSchema>;

/** How a puzzle went. "helped" = solved, but only with hints / after mistakes. "skipped" = not attempted (not counted against you). */
export const OUTCOMES = ["solved", "helped", "missed", "skipped"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const PuzzleSchema = z.object({
  id: z.string(),
  theme: z.string(),
  url: z.string().url(),
  themes: z.array(z.string()).default([]),
  result: z.enum(OUTCOMES).optional(), // today's recorded outcome, filled in when the brief is served
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
    puzzle: PuzzleSchema.optional(), // the first puzzle (older briefs only have this)
    puzzles: z.array(PuzzleSchema).max(5).optional(), // today's puzzles, one slide each
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
  solved: z.boolean().optional(), // older clients: just solved / not
  outcome: z.enum(OUTCOMES).optional(),
  seconds: z.number().int().min(0).max(3600).optional(), // time spent on the puzzle slide before answering
  index: z.number().int().min(1).max(10).optional(), // which of today's puzzles (1, 2, 3)
}).refine((b) => b.outcome !== undefined || b.solved !== undefined, "outcome or solved is required");
export const NoteInput = z.object({ text: z.string().trim().min(1).max(20000) });
export const SeenInput = z.object({ ids: z.array(z.string().min(1).max(500)).min(1).max(50) });
export const NoteEditInput = NoteInput.extend({ id: z.string().regex(/^[a-f0-9]{12}$/) });

export const SECTION_TITLES: Record<SectionId, string> = {
  chess: "Brain teaser",
  notes: "Previous notes & open loops",
  meetings: "Today's meetings",
  email: "Email",
  work: "Job-critical",
  world: "World news",
  today: "Today's plan",
};
