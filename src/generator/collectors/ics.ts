import { fetchT } from "../net.js";
import { localDate } from "../../shared/dates.js";
import type { Item } from "../../shared/schema.js";

export interface IcsEvent { uid: string; summary: string; start: Date; allDay: boolean; location: string; attendees: number; online: boolean }

/**
 * Minimal ICS reader. Limitations (see docs): RRULE recurrences are not expanded;
 * TZID times are treated as local time.
 */
export function parseIcs(ics: string): IcsEvent[] {
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: IcsEvent[] = [];
  let cur: string[] | null = null;
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") cur = [];
    else if (l === "END:VEVENT" && cur) { const e = toEvent(cur); if (e) out.push(e); cur = null; }
    else if (cur) cur.push(l);
  }
  return out;
}

function toEvent(props: string[]): IcsEvent | null {
  const get = (name: string): { params: string; value: string } | undefined => {
    const l = props.find((p) => p.toUpperCase().startsWith(`${name}:`) || p.toUpperCase().startsWith(`${name};`));
    if (!l) return undefined;
    const i = l.indexOf(":");
    return { params: l.slice(0, i).toUpperCase(), value: l.slice(i + 1) };
  };
  if (get("STATUS")?.value.toUpperCase() === "CANCELLED") return null;
  const dt = get("DTSTART");
  const m = dt && /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(dt.value);
  if (!dt || !m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const allDay = h === undefined;
  const start = allDay ? new Date(+y!, +mo! - 1, +d!) : z ? new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!)) : new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!);
  const unesc = (v = ""): string => v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
  const location = unesc(get("LOCATION")?.value);
  const text = props.join(" ").toLowerCase();
  return {
    uid: get("UID")?.value ?? `${y}${mo}${d}${h ?? ""}`,
    summary: unesc(get("SUMMARY")?.value) || "(no title)",
    start, allDay, location,
    attendees: props.filter((p) => p.toUpperCase().startsWith("ATTENDEE")).length,
    online: /teams\.microsoft\.com|zoom\.us|meet\.google\.com/.test(text),
  };
}

/** One rule-based prep line (no AI in v1). */
export const prepLine = (e: { attendees: number; online: boolean; location: string }): string => {
  const bits = [e.attendees > 0 ? `${e.attendees} attendee${e.attendees === 1 ? "" : "s"}` : "no attendee list", e.online ? "online" : e.location ? `at ${e.location}` : "no location"];
  return `Prep: ${bits.join(", ")}`;
};

export async function icsMeetings(url: string, now: Date): Promise<Item[]> {
  const r = await fetchT(url);
  if (!r.ok) throw new Error(`Calendar feed answered ${r.status}`);
  const today = localDate(now);
  return parseIcs(await r.text())
    .filter((e) => localDate(e.start) === today)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((e) => ({ id: e.uid, title: e.summary, start: e.allDay ? undefined : e.start.toISOString(), summary: e.allDay ? "All day" : prepLine(e) }));
}
