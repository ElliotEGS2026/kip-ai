import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Briefing, Item, Section } from "../shared/schema";
import { api, today } from "./api";
import { NotesCapture } from "./Notes";
import { chunkNotes } from "./notesPaging";
import { Starfield } from "./Starfield";

interface Ms { status: string; userCode?: string; verificationUri?: string; message?: string }

const host = (u?: string): string => { try { return new URL(u ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } };
const time = (iso?: string): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const pad = (n: number): string => String(n).padStart(2, "0");

const SECTION_ICON: Record<string, string> = { chess: "🧩", notes: "📝", meetings: "📅", email: "✉️", work: "🛡️", world: "🌍", today: "✅" };
const TAG_ICON: Record<string, string> = { meeting: "🕒", task: "☐", reply: "↩", review: "🔎", security: "⚠️", release: "🚀", "open-loop": "↻", "awaiting-reply": "↩", unread: "✉️", breaking: "💥", major: "📣", news: "📰", politics: "🏛️", world: "🌍", finance: "💷", priority: "⭐", reminder: "🔔", note: "📝" };
const TAG_MEANING: Record<string, string> = {
  breaking: "Breaking change — may need action in your code or setup.",
  major: "New major version — worth reading what changed before upgrading.",
  security: "Security issue — check whether you are affected.",
  release: "New release of something you track.",
  news: "Industry news that may affect your work.",
  politics: "Politics story.", world: "World story.", finance: "Government or economy money news.",
  priority: "You marked this as a priority — it stays at the top until you clear it.", reminder: "You asked to be reminded about this again.",
  note: "A note you wrote earlier.",
  meeting: "On your calendar today.", reply: "Someone is waiting for your reply.", "open-loop": "A task you noted but haven't ticked off.",
};
const ago = (d?: string): string => {
  const ms = d ? Date.parse(d) : NaN;
  if (Number.isNaN(ms)) return "";
  const days = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

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

const PLAN_GROUPS: { tag: string; title: string; icon: string; empty: string }[] = [
  { tag: "meeting", title: "Meetings", icon: "📅", empty: "No meetings today" },
  { tag: "task", title: "Tasks", icon: "☑️", empty: "No open tasks" },
  { tag: "reply", title: "Replies owed", icon: "↩️", empty: "No replies waiting" },
  { tag: "review", title: "To review", icon: "🔎", empty: "Nothing to review" },
];

/** Today's plan: one column, in the order you'd work through the day (meetings, tasks, replies, review). */
function PlanBody({ s }: { s: Section }) {
  if (s.items.length === 0) return <div className="slide"><div className="big-ico" aria-hidden="true">🎉</div><h3 className="slide-title">A clear day</h3><p className="muted">Nothing scheduled or outstanding.</p>{s.warnings.map((w) => <p key={w} className="muted small">⚠ {w}</p>)}</div>;
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
      {s.warnings.map((w) => <p key={w} className="muted small">⚠ {w}</p>)}
    </div>
  );
}

/** One screen of the walkthrough. Every item gets its own slide so nothing is skimmed past. */
interface Slide {
  group: string; // "warm" (brain teaser + notes) or a section id
  tab?: "teaser" | "notes";
  section: Section;
  kind: "item" | "status" | "puzzle" | "capture" | "plan" | "notes";
  item?: Item;
  items?: Item[]; // kind "notes": several notes on one page
  n?: number;
  of?: number;
}

const GROUP_TITLE: Record<string, string> = { warm: "Warm-up" };

function buildSlides(sections: Section[]): Slide[] {
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
type SetNote = (item: Item, patch: Partial<NoteUi>) => void;
/** What the page currently shows for a note: the user's changes this session, else what the brief says. */
const noteState = (item: Item, ui: Record<string, NoteUi>): NoteUi => ui[item.id] ?? { completed: !!item.completed, priority: !!item.priority, deleted: false };
/** Called after a new note is saved so the notes pages can pick it up without a reload. */
const NoteSavedCtx = createContext<() => void>(() => undefined);
const isTask = (i: Item): boolean => i.tag === "open-loop";

/** Several notes on one page, as bullet points, each with Completed + Priority controls. */
function NotesPage({ slide, ui, setNote }: { slide: Slide; ui: Record<string, NoteUi>; setNote: SetNote }) {
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

function SlideView({ slide, noteUi, setNote }: { slide: Slide; noteUi: Record<string, NoteUi>; setNote: SetNote }) {
  const onSaved = useContext(NoteSavedCtx);
  const { section: s, item } = slide;
  const sourced = s.id === "work" || s.id === "world";
  if (slide.kind === "puzzle") return <Puzzle s={s} />;
  if (slide.kind === "plan") return <PlanBody s={s} />;
  if (slide.kind === "notes") return <NotesPage slide={slide} ui={noteUi} setNote={setNote} />;
  if (slide.kind === "capture") {
    return <div className="slide wide"><div className="big-ico" aria-hidden="true">🎙</div><h3 className="slide-title">Add a new note</h3><p className="muted">Type or speak a note. It appears in your notes straight away and stays on your list until you complete it.</p><NotesCapture showHistory={false} onSaved={onSaved} /></div>;
  }
  if (slide.kind === "status") {
    return (
      <div className="slide">
        <div className="big-ico" aria-hidden="true">{s.status === "error" ? "⚠️" : s.status === "not_configured" ? "🔌" : SECTION_ICON[s.id]}</div>
        <h3 className="slide-title">{s.status === "error" ? "Something went wrong" : s.status === "not_configured" ? "Not set up yet" : "Nothing to show"}</h3>
        {s.message && <p className={s.status === "error" ? "err" : "muted"}>{s.message}</p>}
        {s.warnings.map((w) => <p key={w} className="muted small">⚠ {w}</p>)}
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

function Connect() {
  const [ms, setMs] = useState<Ms>({ status: "…" });
  const refresh = () => api<Ms>("/api/ms/status").then(setMs).catch(() => undefined);
  useEffect(() => { void refresh(); const t = setInterval(() => { void refresh(); }, 4000); return () => clearInterval(t); }, []);
  if (ms.status === "connected") return <button className="ghost" onClick={() => api<Ms>("/api/ms/disconnect", {}).then(setMs)}>Microsoft ✔ Disconnect</button>;
  if (ms.status === "pending") return <span className="muted small">Go to <a href={ms.verificationUri} target="_blank" rel="noreferrer noopener">{ms.verificationUri}</a> and enter <b>{ms.userCode}</b></span>;
  if (ms.status === "not_configured") return <span className="muted small" title={ms.message}>Microsoft: set KIP_MS_CLIENT_ID</span>;
  return <button className="ghost" onClick={() => api<Ms>("/api/ms/connect", {}).then(setMs)}>Connect Microsoft{ms.status === "error" ? ` (${ms.message})` : ""}</button>;
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <div className="clock"><b>{pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}</b><span>{now.toDateString()}</span></div>;
}

const countLabel = (s: Section): string => (s.status === "ok" ? String(s.items.length) : s.status === "error" ? "!" : "–");

/** Core reactor. `progress` is 0..1 for the arc. */
function Core({ label, sub, progress, mini, onClick }: { label?: string; sub?: string; progress: number; mini?: boolean; onClick?: () => void }) {
  const C = 2 * Math.PI * 118;
  return (
    <button className={`core ${mini ? "mini" : ""}`} onClick={onClick} disabled={!onClick} aria-label={`${label ?? ""} ${sub ?? ""}`.trim()}>
      <svg viewBox="0 0 280 280" aria-hidden="true">
        <circle className="ring r1" cx="140" cy="140" r="134" />
        <circle className="ring r2" cx="140" cy="140" r="104" />
        <circle className="ring r3" cx="140" cy="140" r="84" />
        <circle className="arc-bg" cx="140" cy="140" r="118" />
        <circle className="arc" cx="140" cy="140" r="118" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
      {!mini && <span className="core-text"><small>{sub}</small><strong>{label}</strong></span>}
      {mini && <span className="core-text"><strong>{sub}</strong></span>}
    </button>
  );
}

/** A reader: one slide at a time, with centred Back / Next. */
function Reader({ slides, idx, setIdx, titleOf, onFinish, onClose, finishLabel, ringProgress, noteUi, setNote }: {
  slides: Slide[]; idx: number; setIdx: (i: number) => void; titleOf: (group: string) => string;
  onFinish: () => void; onClose: () => void; finishLabel: string; ringProgress: number;
  noteUi: Record<string, NoteUi>; setNote: SetNote;
}) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const slide = slides[idx];
  if (!slide) return null;
  /** Notes on this page that the user has not marked completed (tasks are closed in the note text, not here). */
  const open = slide.kind === "notes" ? (slide.items ?? []).filter((i) => { const st = noteState(i, noteUi); return !isTask(i) && !st.completed && !st.deleted; }) : [];
  /** Leaving a page with uncompleted notes asks first; anywhere else just goes. */
  const leave = (go: () => void) => (open.length > 0 ? setPending(() => go) : go());
  const last = idx === slides.length - 1;
  const next = slides[idx + 1];
  const nextLabel = last ? finishLabel : next && next.group !== slide.group ? `Next: ${titleOf(next.group)} →` : "Next →";
  const first = (tab: "teaser" | "notes") => slides.findIndex((x) => x.group === "warm" && x.tab === tab);
  const counter = slide.kind === "item" ? `${slide.section.title} · ${slide.n} of ${slide.of}` : slide.kind === "notes" ? `Notes · page ${slide.n} of ${slide.of}` : `${titleOf(slide.group)}`;
  return (
    <main className="panel walk" role="dialog" aria-label={titleOf(slide.group)}>
      <div className="panel-head">
        <Core mini progress={ringProgress} sub={`${idx + 1}/${slides.length}`} />
        <h2><span aria-hidden="true">{SECTION_ICON[slide.group] ?? "🧩"}</span> {titleOf(slide.group)}</h2>
        <button className="ghost close" onClick={() => leave(onClose)} title="Back to the main page (Esc)">✕ Close</button>
      </div>
      {slide.group === "warm" && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={slide.tab === "teaser"} className={slide.tab === "teaser" ? "on" : ""} onClick={() => setIdx(first("teaser"))}>🧩 Brain teaser</button>
          <button role="tab" aria-selected={slide.tab === "notes"} className={slide.tab === "notes" ? "on" : ""} onClick={() => setIdx(first("notes"))}>📝 Previous notes</button>
        </div>
      )}
      <div className="panel-body" key={idx}><SlideView slide={slide} noteUi={noteUi} setNote={setNote} /></div>
      <div className="panel-foot">
        <p className="muted small count">{counter}</p>
        <div className="nav">
          <button className="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Back</button>
          <button onClick={() => leave(() => (last ? onFinish() : setIdx(idx + 1)))}>{nextLabel}</button>
        </div>
      </div>
      {pending && (
        <div className="modal-back" role="presentation">
          <div className="modal" role="alertdialog" aria-labelledby="leave-title" data-testid="leave-popup">
            <h3 id="leave-title">{open.length === 1 ? "1 note isn't completed" : `${open.length} notes aren't completed`}</h3>
            <p className="muted">They stay on your list and will be here next time. Mark them completed if they're done.</p>
            <ul className="modal-list">{open.map((i) => <li key={i.id}>{i.title}</li>)}</ul>
            <div className="nav">
              <button className="ghost" data-testid="leave-stay" onClick={() => setPending(null)}>← Stay and review</button>
              <button className="ghost" data-testid="leave-keep" onClick={() => { const go = pending; setPending(null); go(); }}>Keep for later</button>
              <button data-testid="leave-complete" onClick={() => { const go = pending; open.forEach((i) => setNote(i, { completed: true })); setPending(null); go(); }}>✓ Mark completed</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

type Panel = { kind: "group"; group: string; idx: number } | null;

export function App() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [err, setErr] = useState("");
  const [stopped, setStopped] = useState(false);
  /** -1 = intro, 0..slides-1 = walking, slides.length = all done (spread out). */
  const [step, setStep] = useState(-1);
  const [panel, setPanel] = useState<Panel>(null);
  const [noteUi, setNoteUi] = useState<Record<string, NoteUi>>({});
  const setNote: SetNote = (item, patch) => {
    setNoteUi((cur) => ({ ...cur, [item.id]: { ...noteState(item, cur), ...patch } }));
    void api("/api/notes/state", { id: item.id, ...patch }).catch(() => setErr("Could not save your note choice — is the server running?"));
  };
  useEffect(() => { api<Briefing>(`/api/brief/${today()}`).then(setBrief).catch((e: Error) => setErr(e.message)); }, []);
  const stop = async () => { if (confirm("Shut down the Kip server?")) { await api("/api/shutdown", {}).catch(() => undefined); setStopped(true); } };

  const sections = useMemo(() => brief?.sections ?? [], [brief]);
  const slides = useMemo(() => buildSlides(sections), [sections]);
  const groups = useMemo(() => [...new Set(slides.map((s) => s.group))], [slides]);
  const titleOf = (g: string): string => GROUP_TITLE[g] ?? sections.find((s) => s.id === g)?.title ?? g;
  const firstOf = (g: string): number => slides.findIndex((s) => s.group === g);
  const n = slides.length;
  const done = n > 0 && step >= n;
  const walking = step >= 0 && step < n;
  const curGroup = walking ? slides[step]?.group : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") { if (panel) setPanel(null); else if (walking) setStep(slides.length); }
      // Keyboard Next skips note pages: those go through the button so the "not completed" check can run.
      const onNotes = slides[step]?.kind === "notes";
      if (walking && !panel && !onNotes && (e.key === "ArrowRight" || e.key === "Enter")) setStep((x) => x + 1);
      if (walking && !panel && e.key === "ArrowLeft") setStep((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walking, panel, slides, step]);

  /** After a note is saved: fetch the fresh brief (the server rebuilds the notes section) and keep the user on the "add a note" page. */
  const reloadBrief = async () => {
    try {
      const b = await api<Briefing>(`/api/brief/${today()}`);
      const fresh = buildSlides(b.sections);
      setBrief(b);
      if (panel?.kind === "group") {
        const inGroup = fresh.filter((s) => s.group === panel.group);
        setPanel({ kind: "group", group: panel.group, idx: Math.max(0, inGroup.findIndex((s) => s.kind === "capture")) });
      } else if (walking) {
        const at = fresh.findIndex((s) => s.kind === "capture");
        if (at >= 0) setStep(at);
      }
    } catch { /* keep showing what we have */ }
  };

  if (stopped) return <main className="plain"><h1>Kip<span>.</span></h1><p>Server stopped. You can close this tab. Run <code>./scripts/start.sh</code> to start again.</p></main>;

  const intro = !brief
    ? { label: err ? "OFFLINE" : "LOADING", sub: "KIP", progress: 0.15 }
    : step < 0 ? { label: "KIP", sub: "TAP TO BEGIN", progress: 0.08 }
    : { label: "🎙 NOTES", sub: "REVIEW & ADD · TAP", progress: 1 };

  const openSection = (id: string) => {
    const g = id === "chess" || id === "notes" ? "warm" : id;
    // Index must be within the group's own slide list (not the global list), so it opens on that section's first item.
    const at = slides.filter((s) => s.group === g).findIndex((s) => s.section.id === id);
    setPanel({ kind: "group", group: g, idx: Math.max(0, at) });
  };
  const groupSlides = panel?.kind === "group" ? slides.filter((s) => s.group === panel.group) : [];

  return (
    <NoteSavedCtx.Provider value={() => { void reloadBrief(); }}>
    <div className={`stage ${walking ? "walking" : ""} ${done ? "done" : ""}`}>
      <Starfield />
      <header className="hud">
        <div className="brand">Kip<span>.</span><small>MORNING BRIEFING</small></div>
        <nav className="pips" aria-label="Progress">
          {groups.map((g, i) => (
            <button key={g} className={`pip ${g === curGroup ? "on" : ""} ${(walking && curGroup && groups.indexOf(curGroup) > i) || done ? "seen" : ""}`} title={titleOf(g)}
              onClick={() => (done ? setPanel({ kind: "group", group: g, idx: 0 }) : (setPanel(null), setStep(firstOf(g))))}><span aria-hidden="true">{SECTION_ICON[g] ?? "🧩"}</span> {pad(i + 1)}</button>
          ))}
        </nav>
        <div className="hud-right">
          <Clock /><Connect /><button className="danger" onClick={() => { void stop(); }}>Shut down</button>
        </div>
      </header>

      {brief?.sample && <p className="banner">Sample data — run <code>npm run generate</code> (or ./scripts/start.sh --refresh) for today's real brief.</p>}
      {err && <p className="banner err">Could not load the briefing: {err}</p>}

      {!walking && (
        <div className="center">
          <Core {...intro} onClick={brief ? (step < 0 ? () => setStep(0) : () => openSection("notes")) : undefined} />
          {brief && step < 0 && <p className="hint">Press the core to start — one item at a time.</p>}
          {done && sections.map((s, i) => (
            <button key={s.id} className={`orb ${s.status}`} style={{ "--a": `${(360 / sections.length) * i - 90}deg` } as React.CSSProperties} onClick={() => openSection(s.id)}>
              <span className="orb-ico" aria-hidden="true">{SECTION_ICON[s.id]}</span><b>{countLabel(s)}</b><span>{s.title}</span>
            </button>
          ))}
          {done && <button className="again ghost" onClick={() => { setStep(0); setPanel(null); }}>↻ Replay briefing</button>}
        </div>
      )}

      {walking && !panel && (
        <Reader slides={slides} idx={step} setIdx={setStep} titleOf={titleOf} onFinish={() => setStep(n)} onClose={() => setStep(n)} finishLabel="Finish ✓" ringProgress={(step + 1) / n} noteUi={noteUi} setNote={setNote} />
      )}

      {panel?.kind === "group" && groupSlides.length > 0 && (
          <Reader slides={groupSlides} idx={Math.min(panel.idx, groupSlides.length - 1)} setIdx={(i) => setPanel({ kind: "group", group: panel.group, idx: i })}
            titleOf={titleOf} onFinish={() => setPanel(null)} onClose={() => setPanel(null)} finishLabel="Close ✕" ringProgress={(panel.idx + 1) / groupSlides.length} noteUi={noteUi} setNote={setNote} />
      )}

    </div>
    </NoteSavedCtx.Provider>
  );
}
