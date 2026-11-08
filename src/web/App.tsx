import { useEffect, useMemo, useState } from "react";
import type { Briefing, Item, Section } from "../shared/schema";
import { api, today } from "./api";
import { NotesCapture } from "./Notes";
import { Starfield } from "./Starfield";

interface Ms { status: string; userCode?: string; verificationUri?: string; message?: string }

const host = (u?: string): string => { try { return new URL(u ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } };
const time = (iso?: string): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const pad = (n: number): string => String(n).padStart(2, "0");

function Thumbs({ item }: { item: Item }) {
  const [done, setDone] = useState("");
  const send = (kind: "up" | "down") => api("/api/feedback", { kind, target: "source", value: item.url ?? "" }).then(() => setDone(kind === "up" ? "★ saved" : "blocked")).catch(() => setDone("failed"));
  if (!item.url) return null;
  return done ? <span className="muted">{done}</span> : (
    <span className="thumbs">
      <button title="More from this source" onClick={() => send("up")}>👍</button>
      <button title="Block this source" onClick={() => send("down")}>👎</button>
    </span>
  );
}

function ItemRow({ item, thumbs }: { item: Item; thumbs: boolean }) {
  return (
    <li>
      <div>
        {item.start && <span className="time">{time(item.start)}</span>}
        {item.tag && <span className={`tag tag-${item.tag}`}>{item.tag}</span>}
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer noopener">{item.title}</a> : <span>{item.title}</span>}
        {item.unverified && <span className="tag">unverified</span>}
      </div>
      {item.summary && <div className="muted">{item.summary}</div>}
      <div className="muted small">{[item.source ?? host(item.url), item.date].filter(Boolean).join(" · ")} {thumbs && <Thumbs item={item} />}</div>
    </li>
  );
}

function Puzzle({ s }: { s: Section }) {
  const [res, setRes] = useState("");
  const p = s.puzzle;
  if (!p) return null;
  const record = (solved: boolean) => api("/api/puzzle-result", { puzzleId: p.id, theme: p.theme, solved }).then(() => setRes(solved ? "Solved ✔ recorded" : "Missed — we'll show more of this theme")).catch(() => setRes("Could not save"));
  return (
    <div>
      <p>Today's theme: <b>{p.theme}</b>. <a href={p.url} target="_blank" rel="noreferrer noopener">Open puzzle ↗</a></p>
      {res ? <p className="muted">{res}</p> : <p><button onClick={() => record(true)}>I solved it</button> <button onClick={() => record(false)}>I missed it</button></p>}
    </div>
  );
}

function SectionBody({ s }: { s: Section }) {
  const sourced = s.id === "work" || s.id === "world";
  return (
    <>
      {s.status === "error" && <p className="err">⚠ {s.message}</p>}
      {s.status === "not_configured" && <p className="muted">{s.message}</p>}
      {s.status === "ok" && s.id === "chess" && <Puzzle s={s} />}
      {s.status === "ok" && s.items.length === 0 && s.id !== "chess" && <p className="muted">Nothing to show.</p>}
      {s.items.length > 0 && <ul>{s.items.map((i) => <ItemRow key={i.id} item={i} thumbs={sourced} />)}</ul>}
      {s.warnings.map((w) => <p key={w} className="muted small">⚠ {w}</p>)}
      {s.id === "notes" && <NotesCapture showHistory={false} />}
    </>
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
function Core({ label, sub, progress, onClick }: { label: string; sub: string; progress: number; onClick?: () => void }) {
  const C = 2 * Math.PI * 118;
  return (
    <button className="core" onClick={onClick} disabled={!onClick} aria-label={`${label} ${sub}`}>
      <svg viewBox="0 0 280 280" aria-hidden="true">
        <circle className="ring r1" cx="140" cy="140" r="134" />
        <circle className="ring r2" cx="140" cy="140" r="104" />
        <circle className="ring r3" cx="140" cy="140" r="84" />
        <circle className="arc-bg" cx="140" cy="140" r="118" />
        <circle className="arc" cx="140" cy="140" r="118" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
      <span className="core-text"><small>{sub}</small><strong>{label}</strong></span>
    </button>
  );
}

type Panel = { kind: "section"; id: string } | { kind: "note" } | null;

export function App() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [err, setErr] = useState("");
  const [stopped, setStopped] = useState(false);
  /** -1 = intro, 0..n-1 = walking through sections, n = all done (spread out). */
  const [step, setStep] = useState(-1);
  const [panel, setPanel] = useState<Panel>(null);
  useEffect(() => { api<Briefing>(`/api/brief/${today()}`).then(setBrief).catch((e: Error) => setErr(e.message)); }, []);
  const stop = async () => { if (confirm("Shut down the Kip server?")) { await api("/api/shutdown", {}).catch(() => undefined); setStopped(true); } };

  const sections = useMemo(() => brief?.sections ?? [], [brief]);
  const n = sections.length;
  const done = n > 0 && step >= n;
  const walking = step >= 0 && step < n;
  const current = walking ? sections[step] : undefined;
  const open = panel?.kind === "section" ? sections.find((s) => s.id === panel.id) : undefined;
  const noteOpen = panel?.kind === "note";
  const shown = noteOpen ? undefined : current ?? open;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") setPanel(null);
      if (walking && (e.key === "ArrowRight" || e.key === "Enter")) setStep((x) => x + 1);
      if (walking && e.key === "ArrowLeft") setStep((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walking]);

  if (stopped) return <main className="plain"><h1>Kip<span>.</span></h1><p>Server stopped. You can close this tab. Run <code>./scripts/start.sh</code> to start again.</p></main>;

  const coreProps = !brief
    ? { label: err ? "OFFLINE" : "LOADING", sub: "KIP", progress: 0.15 }
    : step < 0 ? { label: "KIP", sub: "TAP TO BEGIN", progress: 0.08 }
    : done ? { label: "ALL CLEAR", sub: "BRIEFING COMPLETE", progress: 1 }
    : { label: (current?.title ?? "").toUpperCase(), sub: `SECTION ${step + 1} / ${n}`, progress: (step + 1) / n };

  return (
    <div className={`stage ${walking ? "walking" : ""} ${done ? "done" : ""}`}>
      <Starfield />
      <header className="hud">
        <div className="brand">Kip<span>.</span><small>MORNING BRIEFING</small></div>
        <nav className="pips" aria-label="Progress">
          {sections.map((s, i) => (
            <button key={s.id} className={`pip ${i === step ? "on" : ""} ${i < step ? "seen" : ""} ${s.status}`} title={s.title}
              onClick={() => (done ? setPanel({ kind: "section", id: s.id }) : setStep(i))}>{pad(i + 1)}</button>
          ))}
        </nav>
        <div className="hud-right"><Clock /><Connect /><button className="danger" onClick={() => { void stop(); }}>Shut down</button></div>
      </header>

      {brief?.sample && <p className="banner">Sample data — run <code>npm run generate</code> (or ./scripts/start.sh --refresh) for today's real brief.</p>}
      {err && <p className="banner err">Could not load the briefing: {err}</p>}

      <div className="center">
        <Core {...coreProps} onClick={brief && step < 0 ? () => setStep(0) : undefined} />
        {brief && step < 0 && <p className="hint">Press the core to start your briefing — {n} sections, in order.</p>}
        {brief && <button className="note-btn" onClick={() => setPanel({ kind: "note" })}>🎙 Note</button>}
        {done && sections.map((s, i) => (
          <button key={s.id} className={`orb ${s.status}`} style={{ "--a": `${(360 / n) * i - 90}deg` } as React.CSSProperties} onClick={() => setPanel({ kind: "section", id: s.id })}>
            <b>{countLabel(s)}</b><span>{s.title}</span>
          </button>
        ))}
        {done && <button className="again ghost" onClick={() => { setStep(0); setPanel(null); }}>↻ Replay briefing</button>}
      </div>

      {(shown || noteOpen) && (
        <aside className="panel" role="dialog" aria-label={shown?.title ?? "Notes"}>
          <div className="panel-head">
            <h2>{shown ? shown.title : "Notes"}</h2>
            {walking && !noteOpen && <span className="muted small">{step + 1} / {n}</span>}
            {(!walking || noteOpen) && <button className="ghost" onClick={() => setPanel(null)}>✕ Close</button>}
          </div>
          <div className="panel-body">
            {shown ? <SectionBody s={shown} /> : <NotesCapture showHistory />}
          </div>
          {walking && !noteOpen && (
            <div className="panel-foot">
              <button className="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
              <button onClick={() => setStep(step + 1)}>{step === n - 1 ? "Finish ✓" : "Next →"}</button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
