import { createContext, useContext, useState } from "react";
import type { Item, Section } from "../shared/schema";
import { api } from "./api";
import { SECTION_ICON, TAG_ICON, TAG_MEANING, ago, host, time } from "./format";
import { NoteEdit, NotesCapture } from "./Notes";
import { chunkNotes } from "./notesPaging";

/** One screen of the walkthrough. Every item gets its own slide so nothing is skimmed past. */
export interface Slide {
  group: string; // "warm" (brain teaser + notes) or a section id
  tab?: "teaser" | "notes";
  section: Section;
  kind: "item" | "status" | "puzzle" | "capture" | "plan" | "notes";
  item?: Item;
  items?: Item[]; // kind "notes": several notes on one page
  n?: number;
  of?: number;
}

export function buildSlides(sections: Section[]): Slide[] {
  const out: Slide[] = [];
  for (const s of sections) {
    const group = s.id === "chess" || s.id === "notes" ? "warm" : s.id;
    const tab = s.id === "chess" ? "teaser" : s.id === "notes" ? "notes" : undefined;
    const base = { group, tab, section: s } as const;
    if (s.id === "today") { out.push({ ...base, kind: "plan" }); continue; }
    if (s.status === "ok" && s.id === "chess" && s.puzzle) out.push({ ...base, kind: "puzzle" });
    else if (s.status !== "ok" || s.items.length === 0) out.push({ ...base, kind: "status" });
    else if (s.id === "notes") { const pages = chunkNotes(s.items); pages.forEach((items, i) => out.push({ ...base, kind: "notes", items, n: i + 1, of: pages.length })); }
    else s.items.forEach((item, i) => out.push({ ...base, kind: "item", item, n: i + 1, of: s.items.length }));
    if (s.id === "notes") out.push({ ...base, kind: "capture" });
  }
  return out;
}

/** Per-note UI state. Notes are NOT completed by default. */
export interface NoteUi { completed: boolean; priority: boolean; deleted: boolean }
export type SetNote = (item: Item, patch: Partial<NoteUi>) => void;
/** What the page currently shows for a note: the user's changes this session, else what the brief says. */
export const noteState = (item: Item, ui: Record<string, NoteUi>): NoteUi => ui[item.id] ?? { completed: !!item.completed, priority: !!item.priority, deleted: false };
export const isTask = (i: Item): boolean => i.tag === "open-loop";
/** Called after a new note is saved so the notes pages can pick it up without a reload. */
export const NoteSavedCtx = createContext<() => void>(() => undefined);

const Warnings = ({ s }: { s: Section }) => <>{s.warnings.map((w) => <p key={w} className="muted small">⚠ {w}</p>)}</>;

function Thumbs({ item }: { item: Item }) {
  const [done, setDone] = useState("");
  const send = (kind: "up" | "down") => api("/api/feedback", { kind, target: "source", value: item.url ?? "" }).then(() => setDone(kind === "up" ? "★ saved" : "blocked")).catch(() => setDone("failed"));
  if (!item.url) return null;
  return done ? <span className="muted">{done}</span> : (
    <span className="thumbs">
      <button title="More from this source" onClick={() => send("up")}>👍 More like this</button>
      <button title="Block this source" onClick={() => send("down")}>👎 Block source</button>
    </span>
  );
}

function Puzzle({ s }: { s: Section }) {
  const [res, setRes] = useState("");
  const p = s.puzzle;
  if (!p) return null;
  const record = (solved: boolean) => api("/api/puzzle-result", { puzzleId: p.id, theme: p.theme, solved }).then(() => setRes(solved ? "Solved ✔ recorded" : "Missed — we'll show more of this theme")).catch(() => setRes("Could not save"));
  return (
    <div className="slide">
      <div className="big-ico" aria-hidden="true">♞</div>
      <p className="kicker">Today's theme</p>
      <h3 className="slide-title">{p.theme}</h3>
      <p><a className="bigbtn" href={p.url} target="_blank" rel="noreferrer noopener">Open puzzle on Lichess ↗</a></p>
      {res ? <p className="muted">{res}</p> : <p className="actions-row"><span className="muted">When you're done:</span><button onClick={() => record(true)}>✔ Solved it</button><button className="ghost" onClick={() => record(false)}>✗ Missed it</button></p>}
    </div>
  );
}

const PLAN_GROUPS = [
  { tag: "meeting", title: "Meetings", icon: "📅", empty: "No meetings today" },
  { tag: "task", title: "Tasks", icon: "☑️", empty: "No open tasks" },
  { tag: "reply", title: "Replies owed", icon: "↩️", empty: "No replies waiting" },
  { tag: "review", title: "To review", icon: "🔎", empty: "Nothing to review" },
];

/** Today's plan: one column, in the order you'd work through the day (meetings, tasks, replies, review). */
function PlanBody({ s }: { s: Section }) {
  if (s.items.length === 0) return <div className="slide"><div className="big-ico" aria-hidden="true">🎉</div><h3 className="slide-title">A clear day</h3><p className="muted">Nothing scheduled or outstanding.</p><Warnings s={s} /></div>;
  const byTime = (a: Item, b: Item): number => (a.start ?? "").localeCompare(b.start ?? "");
  return (
    <div className="plan-view" data-testid="plan">
      <p className="kicker">Your day at a glance</p>
      {PLAN_GROUPS.map((g, gi) => {
        const items = s.items.filter((i) => i.tag === g.tag).sort(g.tag === "meeting" ? byTime : () => 0);
        return (
          <section key={g.tag} className={`plan-block ${items.length === 0 ? "is-empty" : ""}`} data-testid={`plan-${g.tag}`}>
            <h3><span className="plan-num">{gi + 1}</span><span aria-hidden="true">{g.icon}</span> {g.title}<span className="plan-count">{items.length}</span></h3>
            {items.length === 0 ? <p className="muted small plan-none">{g.empty}</p> : (
              <ul>{items.map((i) => (
                <li key={i.id}>
                  <span className="plan-when">{i.start ? time(i.start) : "•"}</span>
                  <span className="plan-what">{i.url ? <a href={i.url} target="_blank" rel="noreferrer noopener">{i.title}</a> : i.title}{i.summary && <small className="muted">{i.summary}</small>}</span>
                </li>
              ))}</ul>
            )}
          </section>
        );
      })}
      <Warnings s={s} />
    </div>
  );
}

/** Several notes on one page, as bullet points, each with Completed + Priority controls. */
function NotesPage({ slide, ui, setNote }: { slide: Slide; ui: Record<string, NoteUi>; setNote: SetNote }) {
  const onSaved = useContext(NoteSavedCtx);
  const items = (slide.items ?? []).filter((i) => !noteState(i, ui).deleted);
  return (
    <div className="slide wide notes-page">
      <h3 className="slide-title">📝 Your notes</h3>
      <p className="muted">Tick <b>Completed</b> when a note is done — it is struck out, can be deleted, and drops off tomorrow. Anything not completed stays on your list.</p>
      <ul className="note-list" data-testid="note-list">
        {items.map((item) => {
          const st = noteState(item, ui);
          return (
            <li key={item.id} className={st.completed ? "is-done" : ""} data-testid="note-item">
              <div className="note-text" data-testid="note-text">
                {st.priority && <span aria-label="priority">⭐ </span>}
                <b>{item.title}</b>{item.summary && <span> — {item.summary}</span>}
                <small className="muted"> · {isTask(item) ? "task · " : ""}{item.date}{ago(item.date) ? ` (${ago(item.date)})` : ""}</small>
              </div>
              {isTask(item) ? <span className="muted small">write “- [x] …” in a note to close</span> : (
                <div className="note-actions">
                  <NoteEdit item={item} onSaved={onSaved} />
                  <label className={`check ${st.completed ? "on" : ""}`}>
                    <input type="checkbox" data-testid="note-completed" checked={st.completed} onChange={(e) => setNote(item, { completed: e.target.checked })} />
                    <span>Completed</span>
                  </label>
                  <button className={`star ${st.priority ? "on" : ""}`} data-testid="note-priority" aria-pressed={st.priority} title="Priority notes are listed first" onClick={() => setNote(item, { priority: !st.priority })}>
                    {st.priority ? "⭐ Priority" : "☆ Priority"}
                  </button>
                  {st.completed && <button className="del" data-testid="note-delete" title="Remove this note for good" onClick={() => setNote(item, { deleted: true })}>🗑 Delete</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SlideView({ slide, noteUi, setNote }: { slide: Slide; noteUi: Record<string, NoteUi>; setNote: SetNote }) {
  const onSaved = useContext(NoteSavedCtx);
  const { section: s, item } = slide;
  const sourced = s.id === "work" || s.id === "world";
  if (slide.kind === "puzzle") return <Puzzle s={s} />;
  if (slide.kind === "plan") return <PlanBody s={s} />;
  if (slide.kind === "notes") return <NotesPage slide={slide} ui={noteUi} setNote={setNote} />;
  if (slide.kind === "capture") {
    return <div className="slide wide"><div className="big-ico" aria-hidden="true">🎙</div><h3 className="slide-title">Add a new note</h3><p className="muted">Type or speak a note. It is saved automatically when you leave this page, then stays on your list until you complete it.</p><NotesCapture onSaved={onSaved} /></div>;
  }
  if (slide.kind === "status") {
    return (
      <div className="slide">
        <div className="big-ico" aria-hidden="true">{s.status === "error" ? "⚠️" : s.status === "not_configured" ? "🔌" : SECTION_ICON[s.id]}</div>
        <h3 className="slide-title">{s.status === "error" ? "Something went wrong" : s.status === "not_configured" ? "Not set up yet" : "Nothing to show"}</h3>
        {s.message && <p className={s.status === "error" ? "err" : "muted"}>{s.message}</p>}
        <Warnings s={s} />
      </div>
    );
  }
  if (!item) return null;
  return (
    <div className="slide">
      <div className="big-ico" aria-hidden="true">{(item.tag && TAG_ICON[item.tag]) || SECTION_ICON[s.id]}</div>
      <p className="kicker">
        {item.start && <span className="time">{time(item.start)}</span>}
        {item.tag && item.tag !== "note" && <span className={`tag tag-${item.tag}`}>{item.tag}</span>}
        {item.unverified && <span className="tag">unverified</span>}
      </p>
      <h3 className="slide-title">{item.title}</h3>
      {item.tag && TAG_MEANING[item.tag] && <p className={`meaning meaning-${item.tag}`}>{TAG_MEANING[item.tag]}</p>}
      {item.summary ? <p className="slide-sum">{item.summary}</p> : sourced && <p className="muted">No details in the feed — open the source for the full story.</p>}
      <dl className="facts">
        {(item.source ?? host(item.url)) && <><dt>Source</dt><dd>{item.source ?? host(item.url)}</dd></>}
        {item.date && <><dt>{s.id === "notes" ? "Written" : "Published"}</dt><dd>{item.date}{ago(item.date) ? ` (${ago(item.date)})` : ""}</dd></>}
      </dl>
      {item.url && <p><a className="bigbtn" href={item.url} target="_blank" rel="noreferrer noopener">Open ↗</a></p>}
      {sourced && <p><Thumbs item={item} /></p>}
    </div>
  );
}
