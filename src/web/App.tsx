import { useEffect, useMemo, useState } from "react";
import type { Briefing, Item, Section } from "../shared/schema";
import { api, today } from "./api";
import { NotesCapture } from "./Notes";
import { Starfield } from "./Starfield";

interface Ms { status: string; userCode?: string; verificationUri?: string; message?: string }

const host = (u?: string): string => { try { return new URL(u ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } };
const time = (iso?: string): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const pad = (n: number): string => String(n).padStart(2, "0");

const SECTION_ICON: Record<string, string> = { chess: "🧩", notes: "📝", meetings: "📅", email: "✉️", work: "🛡️", world: "🌍", today: "✅" };
const TAG_ICON: Record<string, string> = { meeting: "🕒", task: "☐", reply: "↩", review: "🔎", security: "⚠️", release: "🚀", "open-loop": "↻", "awaiting-reply": "↩", unread: "✉️" };

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

const PLAN_GROUPS: { tag: string; title: string }[] = [
  { tag: "meeting", title: "🕒 Meetings" },
  { tag: "task", title: "☐ Tasks" },
  { tag: "reply", title: "↩ Replies owed" },
  { tag: "review", title: "🔎 To review" },
];

/** Today's plan: one calm, single-column overview of everything that needs doing. */
function PlanBody({ s }: { s: Section }) {
  if (s.items.length === 0) return <div className="slide"><div className="big-ico" aria-hidden="true">🎉</div><h3 className="slide-title">A clear day</h3><p className="muted">Nothing scheduled or outstanding.</p>{s.warnings.map((w) => <p key={w} className="muted small">⚠ {w}</p>)}</div>;
  return (
    <div className="slide plan">
      <p className="kicker">Your day at a glance</p>
      {PLAN_GROUPS.map((g) => {
        const items = s.items.filter((i) => i.tag === g.tag);
        return items.length === 0 ? null : (
          <section key={g.tag} className="plan-col"><h3>{g.title}</h3><ul>{items.map((i) => (
            <li key={i.id}>{i.start && <span className="time">{time(i.start)}</span>}{i.url ? <a href={i.url} target="_blank" rel="noreferrer noopener">{i.title}</a> : i.title}{i.summary && <div className="muted small">{i.summary}</div>}</li>
          ))}</ul></section>
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
  kind: "item" | "status" | "puzzle" | "capture" | "plan";
  item?: Item;
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
    else s.items.forEach((item, i) => out.push({ ...base, kind: "item", item, n: i + 1, of: s.items.length }));
    if (s.id === "notes") out.push({ ...base, kind: "capture" });
  }
  return out;
}

function SlideView({ slide }: { slide: Slide }) {
  const { section: s, item } = slide;
  const sourced = s.id === "work" || s.id === "world";
  if (slide.kind === "puzzle") return <Puzzle s={s} />;
  if (slide.kind === "plan") return <PlanBody s={s} />;
  if (slide.kind === "capture") {
    return <div className="slide wide"><div className="big-ico" aria-hidden="true">🎙</div><h3 className="slide-title">Anything to add?</h3><p className="muted">Type or speak a note. It is saved and shows up in tomorrow's brief.</p><NotesCapture showHistory={false} /></div>;
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
        {item.tag && <span className={`tag tag-${item.tag}`}>{item.tag}</span>}
        {item.unverified && <span className="tag">unverified</span>}
      </p>
      <h3 className="slide-title">{item.title}</h3>
      {item.summary && <p className="slide-sum">{item.summary}</p>}
      <p className="muted small">{[item.source ?? host(item.url), item.date].filter(Boolean).join(" · ")}</p>
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
function Reader({ slides, idx, setIdx, titleOf, onFinish, finishLabel, ringProgress }: {
  slides: Slide[]; idx: number; setIdx: (i: number) => void; titleOf: (group: string) => string;
  onFinish: () => void; finishLabel: string; ringProgress: number;
}) {
  const slide = slides[idx];
  if (!slide) return null;
  const last = idx === slides.length - 1;
  const next = slides[idx + 1];
  const nextLabel = last ? finishLabel : next && next.group !== slide.group ? `Next: ${titleOf(next.group)} →` : "Next →";
  const first = (tab: "teaser" | "notes") => slides.findIndex((x) => x.group === "warm" && x.tab === tab);
  const counter = slide.kind === "item" ? `${slide.section.title} · ${slide.n} of ${slide.of}` : `${titleOf(slide.group)}`;
  return (
    <main className="panel walk" role="dialog" aria-label={titleOf(slide.group)}>
      <div className="panel-head">
        <Core mini progress={ringProgress} sub={`${idx + 1}/${slides.length}`} />
        <h2><span aria-hidden="true">{SECTION_ICON[slide.group] ?? "🧩"}</span> {titleOf(slide.group)}</h2>
      </div>
      {slide.group === "warm" && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={slide.tab === "teaser"} className={slide.tab === "teaser" ? "on" : ""} onClick={() => setIdx(first("teaser"))}>🧩 Brain teaser</button>
          <button role="tab" aria-selected={slide.tab === "notes"} className={slide.tab === "notes" ? "on" : ""} onClick={() => setIdx(first("notes"))}>📝 Yesterday's notes</button>
        </div>
      )}
      <div className="panel-body" key={idx}><SlideView slide={slide} /></div>
      <div className="panel-foot">
        <p className="muted small count">{counter}</p>
        <div className="nav">
          <button className="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Back</button>
          <button onClick={() => (last ? onFinish() : setIdx(idx + 1))}>{nextLabel}</button>
        </div>
      </div>
    </main>
  );
}

type Panel = { kind: "group"; group: string; idx: number } | { kind: "note" } | null;

export function App() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [err, setErr] = useState("");
  const [stopped, setStopped] = useState(false);
  /** -1 = intro, 0..slides-1 = walking, slides.length = all done (spread out). */
  const [step, setStep] = useState(-1);
  const [panel, setPanel] = useState<Panel>(null);
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
  const noteOpen = panel?.kind === "note";
  const curGroup = walking ? slides[step]?.group : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") setPanel(null);
      if (walking && !panel && (e.key === "ArrowRight" || e.key === "Enter")) setStep((x) => x + 1);
      if (walking && !panel && e.key === "ArrowLeft") setStep((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walking, panel]);

  if (stopped) return <main className="plain"><h1>Kip<span>.</span></h1><p>Server stopped. You can close this tab. Run <code>./scripts/start.sh</code> to start again.</p></main>;

  const intro = !brief
    ? { label: err ? "OFFLINE" : "LOADING", sub: "KIP", progress: 0.15 }
    : step < 0 ? { label: "KIP", sub: "TAP TO BEGIN", progress: 0.08 }
    : { label: "ALL CLEAR", sub: "BRIEFING COMPLETE", progress: 1 };

  const openSection = (id: string) => {
    const g = id === "chess" || id === "notes" ? "warm" : id;
    const at = slides.findIndex((s) => s.section.id === id);
    setPanel({ kind: "group", group: g, idx: Math.max(0, at) });
  };
  const groupSlides = panel?.kind === "group" ? slides.filter((s) => s.group === panel.group) : [];

  return (
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
          {brief && step >= 0 && <button className="ghost" onClick={() => setPanel(noteOpen ? null : { kind: "note" })}>🎙 Note</button>}
          <Clock /><Connect /><button className="danger" onClick={() => { void stop(); }}>Shut down</button>
        </div>
      </header>

      {brief?.sample && <p className="banner">Sample data — run <code>npm run generate</code> (or ./scripts/start.sh --refresh) for today's real brief.</p>}
      {err && <p className="banner err">Could not load the briefing: {err}</p>}

      {!walking && (
        <div className="center">
          <Core {...intro} onClick={brief && step < 0 ? () => setStep(0) : undefined} />
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
        <Reader slides={slides} idx={step} setIdx={setStep} titleOf={titleOf} onFinish={() => setStep(n)} finishLabel="Finish ✓" ringProgress={(step + 1) / n} />
      )}

      {panel?.kind === "group" && groupSlides.length > 0 && (
          <Reader slides={groupSlides} idx={Math.min(panel.idx, groupSlides.length - 1)} setIdx={(i) => setPanel({ kind: "group", group: panel.group, idx: i })}
            titleOf={titleOf} onFinish={() => setPanel(null)} finishLabel="Close ✕" ringProgress={(panel.idx + 1) / groupSlides.length} />
      )}

      {noteOpen && (
        <aside className="panel" role="dialog" aria-label="Notes">
          <div className="panel-head"><h2>🎙 Notes</h2><button className="ghost" onClick={() => setPanel(null)}>✕ Close</button></div>
          <div className="panel-body"><div className="slide wide"><NotesCapture showHistory /></div></div>
        </aside>
      )}
    </div>
  );
}
