import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.js";
import { localDate } from "./dates.js";
import type { Outcome } from "./schema.js";

/** Lichess theme keys we rotate through (UNVERIFIED against the live API; used for /training/<theme> links). */
export const THEMES = [
  "fork", "pin", "skewer", "discoveredAttack", "mateIn1", "mateIn2", "mateIn3", "backRankMate",
  "hangingPiece", "deflection", "attraction", "sacrifice", "endgame", "middlegame", "opening",
  "advancedPawn", "trappedPiece", "zugzwang", "doubleCheck", "smotheredMate", "quietMove", "xRayAttack", "interference",
] as const;

export interface ChessState {
  version: 1;
  /** attempts/fails drive which themes you see more of (a "helped" solve counts as half a fail; skips count as neither). */
  themes: Record<string, { attempts: number; fails: number; lastSeen: string; skips?: number; seconds?: number }>;
  history: { date: string; puzzleId: string; theme: string; solved: boolean; outcome?: Outcome; seconds?: number; index?: number }[];
}

const file = (): string => path.join(dataDir(), "chess-weaknesses.json");

export function readChess(): ChessState {
  try {
    const s = JSON.parse(fs.readFileSync(file(), "utf8")) as ChessState;
    if (s.version === 1) return s;
  } catch { /* first run or corrupt: start fresh */ }
  return { version: 1, themes: {}, history: [] };
}

const effect = (o: Outcome) => ({ attempts: o === "skipped" ? 0 : 1, fails: o === "missed" ? 1 : o === "helped" ? 0.5 : 0, skips: o === "skipped" ? 1 : 0 });

/**
 * Records how a puzzle went (and how long it took). Answering the same puzzle again on the same day replaces
 * the earlier answer instead of counting twice. Pass a boolean for the older solved / missed form.
 */
export function recordResult(puzzleId: string, theme: string, result: boolean | Outcome, extra: { seconds?: number; index?: number } = {}): ChessState {
  const outcome: Outcome = typeof result === "boolean" ? (result ? "solved" : "missed") : result;
  const s = readChess(), date = localDate();
  const prev = s.history.findIndex((h) => h.puzzleId === puzzleId && h.date === date);
  if (prev >= 0) {
    const p = s.history[prev]!, pe = effect(p.outcome ?? (p.solved ? "solved" : "missed")), pt = s.themes[p.theme];
    if (pt) { pt.attempts -= pe.attempts; pt.fails -= pe.fails; pt.skips = (pt.skips ?? 0) - pe.skips; pt.seconds = Math.max(0, (pt.seconds ?? 0) - (p.seconds ?? 0)); }
    s.history.splice(prev, 1);
  }
  const e = effect(outcome), t = (s.themes[theme] ??= { attempts: 0, fails: 0, lastSeen: "" });
  t.attempts += e.attempts; t.fails += e.fails; t.lastSeen = date;
  if (e.skips) t.skips = (t.skips ?? 0) + 1;
  if (extra.seconds) t.seconds = (t.seconds ?? 0) + extra.seconds;
  s.history = [...s.history, { date, puzzleId, theme, solved: outcome === "solved" || outcome === "helped", outcome, ...extra }].slice(-300);
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(s, null, 2));
  return s;
}

/** Weak themes weigh more: ((fails+1)/(attempts+2))^2. Unseen themes start at 0.25 so new themes still get explored. */
export const weight = (t?: { attempts: number; fails: number }): number => (((t?.fails ?? 0) + 1) / ((t?.attempts ?? 0) + 2)) ** 2;

/** Deterministic per-day pick (rand in [0,1)) so the same puzzle shows all day. */
export function pickTheme(state: ChessState, rand: number): string {
  const ws = THEMES.map((t) => weight(state.themes[t]));
  let r = rand * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < THEMES.length; i++) { r -= ws[i] ?? 0; if (r < 0) return THEMES[i] ?? "fork"; }
  return THEMES[0];
}

/** n different themes, each pick weighted towards your weak ones (a theme already picked can't come up again). */
export function pickThemes(state: ChessState, rand: () => number, n = 3): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(n, THEMES.length); i++) {
    const ws = THEMES.map((t) => (out.includes(t) ? 0 : weight(state.themes[t])));
    let r = rand() * ws.reduce((a, b) => a + b, 0), pick: string = THEMES.find((t) => !out.includes(t)) ?? THEMES[0];
    for (let k = 0; k < THEMES.length; k++) { r -= ws[k] ?? 0; if (r < 0) { pick = THEMES[k] ?? pick; break; } }
    out.push(pick);
  }
  return out;
}

/** Small seeded PRNG (mulberry32) from a string seed. */
export function seeded(seed: string): () => number {
  let h = 1779033703;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
