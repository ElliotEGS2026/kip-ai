import { useEffect, useRef, useState } from "react";
import type { Item } from "../shared/schema";
import { api } from "./api";
import { Icon } from "./Icon";
import { useDictation } from "./Voice";

/**
 * Note capture (typed or spoken). There is no Save button: whatever you typed is saved automatically
 * when you leave the page. Saved notes can be changed afterwards with the Edit button on the notes list.
 */
export function NotesCapture({ onSaved }: { onSaved?: () => void }) {
  const [text, setText] = useState("");
  const latest = useRef({ text, onSaved });
  latest.current = { text, onSaved };
  const voice = useDictation((t) => setText((cur) => (cur ? `${cur} ${t}` : t)));
  // Runs when the page is left (slide change, close, finish): save the draft if there is one.
  useEffect(() => () => {
    const draft = latest.current.text.trim();
    if (draft) void api("/api/notes", { text: draft }).then(() => latest.current.onSaved?.()).catch(() => undefined);
  }, []);

  return (
    <div className="notes">
      <div className="notes-input">
        <textarea
          value={voice.interim ? `${text}${text ? " " : ""}${voice.interim}` : text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Type or speak a note…  (start a line with - [ ] to create an open loop)"
        />
        {voice.supported && (
          <button type="button" className={`mic ${voice.listening ? "live" : ""}`} onClick={voice.listening ? voice.stop : voice.start} aria-pressed={voice.listening} title={voice.listening ? "Stop dictation" : "Dictate a note"}>
            {voice.listening ? "■ Stop" : <><Icon name="mic" /> Speak</>}
          </button>
        )}
      </div>
      <p className="muted small autosave">{voice.error || "Saved automatically when you leave this page. You can edit it later from your notes list."}</p>
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
