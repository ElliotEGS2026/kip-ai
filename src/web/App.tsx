import { useEffect, useState } from "react";
import type { Briefing, Item, Section } from "../shared/schema";
import { api, today } from "./api";

interface Ms { status: string; userCode?: string; verificationUri?: string; message?: string }

const host = (u?: string): string => { try { return new URL(u ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } };
const time = (iso?: string): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

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

function Card({ s }: { s: Section }) {
  const sourced = s.id === "work" || s.id === "world";
  return (
    <details open className={`card ${s.status === "error" ? "card-error" : ""}`}>
      <summary><h2>{s.title}</h2><span className="count">{s.status === "ok" ? s.items.length || "" : s.status === "error" ? "error" : "not set up"}</span></summary>
      {s.status === "error" && <p className="err">⚠ {s.message}</p>}
      {s.status === "not_configured" && <p className="muted">{s.message}</p>}
      {s.status === "ok" && s.id === "chess" && <Puzzle s={s} />}
      {s.status === "ok" && s.items.length === 0 && s.id !== "chess" && <p className="muted">Nothing to show.</p>}
      {s.items.length > 0 && <ul>{s.items.map((i) => <ItemRow key={i.id} item={i} thumbs={sourced} />)}</ul>}
      {s.warnings.map((w) => <p key={w} className="muted small">⚠ {w}</p>)}
    </details>
  );
}

function Notes() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const save = () => api("/api/notes", { text }).then(() => { setText(""); setMsg("Saved. Use “- [ ] task” lines to create open loops."); }).catch((e: Error) => setMsg(`Failed: ${e.message}`));
  return (
    <details className="card"><summary><h2>Quick note</h2></summary>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Jot a note… (- [ ] for open loops)" />
      <p><button disabled={!text.trim()} onClick={save}>Save note</button> <span className="muted small">{msg}</span></p>
    </details>
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

export function App() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [err, setErr] = useState("");
  const [stopped, setStopped] = useState(false);
  useEffect(() => { api<Briefing>(`/api/brief/${today()}`).then(setBrief).catch((e: Error) => setErr(e.message)); }, []);
  const stop = async () => { if (confirm("Shut down the Kip server?")) { await api("/api/shutdown", {}).catch(() => undefined); setStopped(true); } };

  if (stopped) return <main><h1>Kip<span>.</span></h1><p>Server stopped. You can close this tab. Run <code>./scripts/start.sh</code> to start again.</p></main>;
  return (
    <main>
      <header>
        <h1>Kip<span>.</span></h1>
        <div className="muted">{brief ? new Date(`${brief.date}T12:00`).toDateString() : ""}</div>
        <div className="actions"><Connect /><button className="danger" onClick={() => { void stop(); }}>Shut down server</button></div>
      </header>
      {brief?.sample && <p className="banner">Showing sample data — run <code>npm run generate</code> (or ./scripts/start.sh --refresh) for today's real brief.</p>}
      {err && <p className="err">Could not load the briefing: {err}</p>}
      {brief?.sections.map((s) => <Card key={s.id} s={s} />)}
      <Notes />
    </main>
  );
}
