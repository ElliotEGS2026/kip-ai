import { useEffect, useState } from "react";
import { api } from "./api";
import { useDictation } from "./Voice";

interface Saved { date: string; text: string }

/** Note capture (typed or spoken) plus the last few days of saved notes. Notes persist in data/notes/. */
export function NotesCapture({ showHistory, onSaved }: { showHistory: boolean; onSaved?: () => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState<Saved[]>([]);
  const load = () => api<Saved[]>("/api/notes").then(setHistory).catch(() => undefined);
  useEffect(() => { if (showHistory) void load(); }, [showHistory]);
  const voice = useDictation((t) => setText((cur) => (cur ? `${cur} ${t}` : t)));

  const save = () => api("/api/notes", { text }).then(() => {
    setText(""); setMsg("Saved ✓ — it's now on your notes list (use ← Back to see it)."); if (showHistory) void load(); onSaved?.();
  }).catch((e: Error) => setMsg(`Failed: ${e.message}`));

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
            {voice.listening ? "■ Stop" : "🎙 Speak"}
          </button>
        )}
      </div>
      <div className="row">
        <button disabled={!text.trim()} onClick={save}>Save note</button>
        <span className="muted small">{voice.error || msg}</span>
      </div>
      {voice.supported
        ? <p className="muted small">Voice uses your browser's speech service (Chrome/Edge send the audio to Google/Microsoft to transcribe). Typed notes never leave this machine.</p>
        : <p className="muted small">Voice dictation isn't available in this browser - use Chrome or Edge.</p>}
      {showHistory && history.length > 0 && (
        <div className="history">
          <h3>Saved notes</h3>
          {history.map((h) => <details key={h.date}><summary>{h.date}</summary><pre>{h.text.trim()}</pre></details>)}
        </div>
      )}
    </div>
  );
}
