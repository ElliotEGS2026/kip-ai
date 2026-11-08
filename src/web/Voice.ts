import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal typings: SpeechRecognition is not in TypeScript's lib.dom. */
interface SRResult { isFinal: boolean; 0: { transcript: string } }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SR {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
}
type SRCtor = new () => SR;

const ctor = (): SRCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

/**
 * Browser speech-to-text. NOTE: Chrome/Edge send the audio to the browser vendor's cloud service
 * for recognition - it is not processed locally. `onFinal` receives each finished phrase.
 */
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const rec = useRef<SR | null>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;
  const supported = typeof window !== "undefined" && !!ctor();

  const stop = useCallback(() => { rec.current?.stop(); }, []);
  const start = useCallback(() => {
    const C = ctor();
    if (!C) return;
    setError("");
    const r = new C();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-GB";
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        if (res.isFinal) cb.current(res[0].transcript.trim()); else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone blocked - allow it in the address bar." : `Voice error: ${e.error}`);
    r.onend = () => { setListening(false); setInterim(""); rec.current = null; };
    rec.current = r;
    r.start();
    setListening(true);
  }, []);
  useEffect(() => () => rec.current?.stop(), []);
  return { supported, listening, interim, error, start, stop };
}
