import { useEffect, useMemo, useRef, useState } from "react";
import type { Briefing } from "../shared/schema";
import { pad } from "../shared/dates";
import { api, today } from "./api";
import { SECTION_ICON } from "./format";
import { Clock, Connect, Core } from "./Hud";
import { Reader } from "./Reader";
import { NoteSavedCtx, buildSlides, noteState, type NoteUi, type SetNote, type Slide } from "./Slides";
import { Kips } from "./Kips";
import { Starfield } from "./Starfield";

const GROUP_TITLE: Record<string, string> = { warm: "Warm-up" };
const countLabel = (s: { status: string; items: unknown[] }): string => (s.status === "ok" ? String(s.items.length) : s.status === "error" ? "!" : "–");

type Panel = { kind: "group"; group: string; idx: number } | null;

export function App() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [err, setErr] = useState("");
  const [stopped, setStopped] = useState(false);
  /** -1 = intro, 0..slides-1 = walking, slides.length = all done (spread out). */
  const [step, setStep] = useState(-1);
  const [panel, setPanel] = useState<Panel>(null);
  const live = useRef({ key: "", group: undefined as string | undefined });
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

  /**
   * After a note is saved or edited: fetch the fresh brief (the server rebuilds the notes section) and keep the user
   * on the same slide. Slides can shift when notes are added, so the current slide is found again by identity.
   */
  const slideKey = (s?: Slide): string => (s ? `${s.group}|${s.kind}|${s.section.id}|${s.item?.id ?? s.n ?? ""}` : "");
  const reloadBrief = async () => {
    try {
      const b = await api<Briefing>(`/api/brief/${today()}`);
      const { key, group } = live.current;
      const all = buildSlides(b.sections);
      const pool = group ? all.filter((s) => s.group === group) : all;
      // Same slide if it still exists; otherwise the first slide of the same section (e.g. "nothing to show" became a notes page).
      let at = pool.findIndex((s) => slideKey(s) === key);
      if (at < 0) { const [g, , sec] = key.split("|"); at = pool.findIndex((s) => s.group === g && s.section.id === sec); }
      setBrief(b);
      if (at >= 0) { if (group) setPanel({ kind: "group", group, idx: at }); else setStep(at); }
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
  live.current = { key: slideKey(panel?.kind === "group" ? groupSlides[Math.min(panel.idx, groupSlides.length - 1)] : walking ? slides[step] : undefined), group: panel?.group };

  return (
    <NoteSavedCtx.Provider value={() => { void reloadBrief(); }}>
    <div className={`stage ${walking ? "walking" : ""} ${done ? "done" : ""}`}>
      <Starfield />
      <Kips />
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
