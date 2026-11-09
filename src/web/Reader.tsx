import { useEffect, useState } from "react";
import { SECTION_ICON } from "./format";
import { Icon } from "./Icon";
import { Core } from "./Hud";
import { SlideView, isTask, noteState, type NoteUi, type SetNote, type Slide } from "./Slides";

/** A reader: one slide at a time, with centred Back / Next. Leaving a notes page with open notes asks first. */
export function Reader({ slides, idx, setIdx, titleOf, onFinish, onClose, finishLabel, ringProgress, noteUi, setNote, askOnce }: {
  slides: Slide[]; idx: number; setIdx: (i: number) => void; titleOf: (group: string) => string;
  onFinish: () => void; onClose: () => void; finishLabel: string; ringProgress: number;
  noteUi: Record<string, NoteUi>; setNote: SetNote;
  /** Only the guided walkthrough asks about open notes, and only once; panels reopened from the summary never do. */
  askOnce?: { done: boolean; mark: () => void };
}) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const slide = slides[idx];
  // While the popup is open, Escape closes just the popup and arrows don't move the slide behind it.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "ArrowLeft" || e.key === "ArrowRight") { e.stopImmediatePropagation(); if (e.key === "Escape") setPending(null); }
    };
    window.addEventListener("keydown", onKey, true); // capture: runs before the app-level key handler
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending]);
  if (!slide) return null;
  /** Notes on this page that the user has not marked completed (tasks are closed in the note text, not here). */
  const open = slide.kind === "notes" ? (slide.items ?? []).filter((i) => { const st = noteState(i, noteUi); return !isTask(i) && !st.completed && !st.deleted; }) : [];
  const leave = (go: () => void) => { if (open.length > 0 && askOnce && !askOnce.done) { askOnce.mark(); setPending(() => go); } else go(); };
  const resolve = (complete: boolean) => { const go = pending; if (complete) open.forEach((i) => setNote(i, { completed: true })); setPending(null); go?.(); };
  const last = idx === slides.length - 1;
  const next = slides[idx + 1];
  const nextLabel = last ? finishLabel : next && next.group !== slide.group ? `Next: ${titleOf(next.group)} →` : "Next →";
  const first = (tab: "teaser" | "notes") => slides.findIndex((x) => x.group === "warm" && x.tab === tab);
  const counter = slide.kind === "puzzle" ? `Brain teaser · puzzle ${slide.n} of ${slide.of}` : slide.kind === "item" ? `${slide.section.title} · ${slide.n} of ${slide.of}` : slide.kind === "notes" ? `Notes · page ${slide.n} of ${slide.of}` : titleOf(slide.group);
  return (
    <main className="panel walk" role="dialog" aria-label={titleOf(slide.group)}>
      <div className="panel-head">
        <Core mini progress={ringProgress} sub={`${idx + 1}/${slides.length}`} />
        <h2><span aria-hidden="true"><Icon name={SECTION_ICON[slide.group] ?? "puzzle"} /></span> {titleOf(slide.group)}</h2>
        <button className="ghost close" onClick={() => leave(onClose)} title="Back to the main page (Esc)">✕ Close</button>
      </div>
      {slide.group === "warm" && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={slide.tab === "teaser"} className={slide.tab === "teaser" ? "on" : ""} onClick={() => setIdx(first("teaser"))}><Icon name="puzzle" /> Brain teaser</button>
          <button role="tab" aria-selected={slide.tab === "notes"} className={slide.tab === "notes" ? "on" : ""} onClick={() => setIdx(first("notes"))}><Icon name="note" /> Previous notes</button>
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
              <button className="ghost" data-testid="leave-stay" autoFocus onClick={() => setPending(null)}>← Stay and review</button>
              <button data-testid="leave-keep" onClick={() => resolve(false)}>Keep for later</button>
              <button className="ghost" data-testid="leave-complete" onClick={() => resolve(true)}>✓ Mark completed</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
