import { useEffect, useRef, useState } from "react";
import type { Item } from "../shared/schema";
import { api } from "./api";
import { Icon } from "./Icon";
import { useDictation } from "./Voice";

/**
 * Note capture (typed or spoken). "Save note" (or Ctrl+Enter) saves the note, clears the box and keeps you here
 * to write another. Anything still in the box is also saved automatically when you leave the page.
 * Saved notes can be changed afterwards with the Edit button on the notes list.
 */
export function NotesCapture({ onSaved }: { onSaved?: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [err, setErr] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  /** Text currently being sent by the Save button, so leaving mid-save doesn't send it twice. */
  const inFlight = useRef("");
  const latest = useRef({ text, onSaved });
  latest.current = { text, onSaved };
  const voice = useDictation((t) => setText((cur) => (cur ? `${cur} ${t}` : t)));
  // Runs when the page is left (slide change, close, finish): save the draft if there is one.
  useEffect(() => () => {
    const draft = latest.current.text.trim();
    if (draft && draft !== inFlight.current) void api("/api/notes", { text: draft }).then(() => latest.current.onSaved?.()).catch(() => undefined);
  }, []);

  const save = () => {
    const draft = text.trim();
    if (!draft || saving) return;
    if (voice.listening) voice.stop();
    setSaving(true);
    setErr("");
    inFlight.current = draft;
    api("/api/notes", { text: draft })
      .then(() => {
        // Only clear what was saved: anything typed while the request was in flight stays in the box.
        setText((cur) => (cur.trim() === draft ? "" : cur));
        setSavedCount((n) => n + 1);
        box.current?.focus();
        latest.current.onSaved?.();
      })
      .catch((e: Error) => setErr(`Could not save the note (${e.message}). Your text is still here, try again.`))
      .finally(() => { inFlight.current = ""; setSaving(false); });
  };

  const status = err || voice.error
    || (savedCount > 0 ? `Saved ${savedCount === 1 ? "1 note" : `${savedCount} notes`}. Type the next one, or move on.` : "Anything left in the box is saved when you leave this page.");
  return (
    <div className="notes">
      <div className="notes-input">
        <textarea
          ref={box}
          data-testid="note-capture-box"
          aria-label="New note"
          value={voice.interim ? `${text}${text ? " " : ""}${voice.interim}` : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }}
          rows={3}
          placeholder="Type or speak a note…  (start a line with - [ ] to create an open loop)"
        />
        {voice.supported && (
          <button type="button" className={`mic ${voice.listening ? "live" : ""}`} onClick={voice.listening ? voice.stop : voice.start} aria-pressed={voice.listening} title={voice.listening ? "Stop dictation" : "Dictate a note"}>
            {voice.listening ? "■ Stop" : <><Icon name="mic" /> Speak</>}
          </button>
        )}
      </div>
      <div className="capture-bar">
        <p className={`small autosave ${err || voice.error ? "err" : savedCount > 0 ? "saved" : "muted"}`} role="status" aria-live="polite" data-testid="note-capture-status">{status}</p>
        <button type="button" className="save-note" data-testid="note-save" onClick={save} disabled={!text.trim() || saving} title="Save note (Ctrl+Enter)">
          <Icon name="check" /> {saving ? "Saving…" : "Save note"}
        </button>
      </div>
      {voice.supported
        ? <p className="muted small">Voice uses your browser's speech service (Chrome/Edge send the audio to Google/Microsoft to transcribe). Typed notes never leave this machine.</p>
        : <p className="muted small">Voice dictation isn't available in this browser - use Chrome or Edge.</p>}
    </div>
  );
}

/** Edit button for one saved note: opens its text in a box; "Done" (or leaving the page) saves the change. */
export function NoteEdit({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const [draft, setDraft] = useState<string | null>(null); // null = not editing
  const [err, setErr] = useState("");
  const original = useRef("");
  const latest = useRef({ draft, onSaved });
  latest.current = { draft, onSaved };
  /** Saves if the text changed. Resolves false when saving failed, so the box stays open and nothing is lost. */
  const save = (): Promise<boolean> => {
    const d = latest.current.draft;
    if (d === null || !d.trim() || d.trim() === original.current.trim()) return Promise.resolve(true);
    return api("/api/notes/edit", { id: item.id, text: d })
      .then(() => { latest.current.onSaved(); return true; })
      .catch((e: Error) => { setErr(`Could not save the edit (${e.message}). If Kip was updated, restart it and try again.`); return false; });
  };
  useEffect(() => () => { void save(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = () => {
    setErr("");
    return api<{ text?: string }>(`/api/notes/${item.id}`)
      .then((r) => { if (typeof r.text !== "string") throw new Error("unexpected reply"); original.current = r.text; setDraft(r.text); })
      .catch((e: Error) => setErr(`Could not open this note (${e.message}). If Kip was updated, restart it and try again.`));
  };
  const done = () => { void save().then((ok) => { if (ok) setDraft(null); }); };
  return (
    <>
      <button className="ghost" data-testid="note-edit" onClick={draft === null ? () => { void open(); } : done}>{draft === null ? "✎ Edit" : "✓ Done"}</button>
      {err && <p className="err small note-edit" data-testid="note-edit-error">{err}</p>}
      {draft !== null && (
        <div className="note-edit">
          <textarea data-testid="note-edit-box" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit note" />
        </div>
      )}
    </>
  );
}
