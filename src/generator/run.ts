import fs from "node:fs";
import path from "node:path";
import { addDays, localDate } from "../shared/dates.js";
import { dataDir } from "../shared/paths.js";
import { BriefingSchema, SECTION_IDS, SECTION_TITLES, SOURCED, SectionSchema, type Briefing, type Section, type SectionId } from "../shared/schema.js";
import { linkAlive } from "./net.js";
import { NotConfigured, type Collector, type Ctx } from "./types.js";
import { notes } from "./collectors/notes.js";
import { meetings } from "./collectors/meetings.js";
import { email } from "./collectors/email.js";
import { work } from "./collectors/work.js";
import { world } from "./collectors/world.js";
import { chess } from "./collectors/chess.js";
import { buildToday } from "./collectors/today.js";

/** Independent collectors. "today" is derived from their results afterwards (see buildToday). */
export type SourceId = Exclude<SectionId, "today">;
export const COLLECTORS: Record<SourceId, Collector> = { chess, notes, meetings, email, work, world };
const RETENTION_DAYS = 14;
const TIMEOUT_MS = 60000;

const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms); })]);
  } finally { clearTimeout(timer); } // a dangling timer would keep the process alive for the full timeout
};

/** Each section runs alone: a failure becomes that section's error card and never affects the others. */
export async function runSection(id: SectionId, collector: Collector, ctx: Ctx): Promise<Section> {
  const base = { id, title: SECTION_TITLES[id], warnings: [] as string[], items: [] };
  try {
    const r = await withTimeout(collector(ctx), TIMEOUT_MS);
    const section = SectionSchema.safeParse({ ...base, status: "ok", ...r });
    if (section.success) return section.data;
    return { ...base, status: "error", message: `Section produced invalid data: ${section.error.issues[0]?.message ?? "unknown"}` };
  } catch (e) {
    if (e instanceof NotConfigured) return { ...base, status: "not_configured", message: e.message };
    return { ...base, status: "error", message: (e as Error).message };
  }
}

/** Every news/security link must work; ones that don't are labelled unverified (never silently kept as verified). */
export async function verifyLinks(sections: Section[]): Promise<void> {
  const items = sections.filter((s) => SOURCED.includes(s.id)).flatMap((s) => s.items).filter((i) => i.url && !i.unverified);
  await Promise.all(items.map(async (i) => { if (!(await linkAlive(i.url!))) i.unverified = true; }));
}

export function toMarkdown(b: Briefing): string {
  const lines = [`# Kip brief: ${b.date}`, ""];
  for (const s of b.sections) {
    lines.push(`## ${s.title}`);
    if (s.status !== "ok") lines.push(`_${s.status === "error" ? "Error" : "Not set up"}: ${s.message ?? ""}_`);
    for (const p of s.puzzles ?? (s.puzzle ? [s.puzzle] : [])) lines.push(`- Theme **${p.theme}**: ${p.url}`);
    for (const i of s.items) {
      lines.push(`- ${i.start ? `${new Date(i.start).toTimeString().slice(0, 5)} ` : ""}${i.tag ? `[${i.tag}] ` : ""}${i.url ? `[${i.title}](${i.url})` : i.title}${i.date ? ` (${i.date})` : ""}${i.unverified ? " _unverified_" : ""}${i.summary ? ` — ${i.summary}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function generate(now: Date = new Date(), collectors = COLLECTORS, check = verifyLinks): Promise<Briefing> {
  const ctx: Ctx = { today: localDate(now), now };
  const sourceIds = SECTION_IDS.filter((id): id is SourceId => id !== "today");
  const base = await Promise.all(sourceIds.map((id) => runSection(id, collectors[id], ctx)));
  const today = await runSection("today", async () => buildToday(base), ctx);
  const sections = SECTION_IDS.map((id) => (id === "today" ? today : base.find((s) => s.id === id)!));
  await check(sections);
  const briefing = BriefingSchema.parse({ date: ctx.today, generatedAt: now.toISOString(), sections });
  const dir = path.join(dataDir(), "briefings");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${ctx.today}.json`), JSON.stringify(briefing, null, 2));
  fs.writeFileSync(path.join(dir, `${ctx.today}.md`), toMarkdown(briefing));
  pruneOld(dir, now);
  return briefing;
}

/** Retention rule: briefings may hold email/meeting content, so they are deleted after 14 days. */
export function pruneOld(dir: string, now: Date): void {
  const cutoff = localDate(addDays(now, -RETENTION_DAYS));
  for (const f of fs.readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}\.(json|md)$/.test(f) && f.slice(0, 10) < cutoff) fs.rmSync(path.join(dir, f));
}
