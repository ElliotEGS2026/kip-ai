import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.js";
import { localDate } from "./dates.js";

/** Lichess theme keys we rotate through (UNVERIFIED against the live API; used for /training/<theme> links). */
export const THEMES = [
  "fork", "pin", "skewer", "discoveredAttack", "mateIn1", "mateIn2", "mateIn3", "backRankMate",
  "hangingPiece", "deflection", "attraction", "sacrifice", "endgame", "middlegame", "opening",
  "advancedPawn", "trappedPiece", "zugzwang", "doubleCheck", "smotheredMate", "quietMove", "xRayAttack", "interference",
] as const;

export interface ChessState {
  version: 1;
  themes: Record<string, { attempts: number; fails: number; lastSeen: string }>;
  history: { date: string; puzzleId: string; theme: string; solved: boolean }[];
}

const file = (): string => path.join(dataDir(), "chess-weaknesses.json");

export function readChess(): ChessState {
  try {
    const s = JSON.parse(fs.readFileSync(file(), "utf8")) as ChessState;
    if (s.version === 1) return s;
  } catch { /* first run or corrupt: start fresh */ }
  return { version: 1, themes: {}, history: [] };
}

export function recordResult(puzzleId: string, theme: string, solved: boolean): ChessState {
  const s = readChess();
  const t = (s.themes[theme] ??= { attempts: 0, fails: 0, lastSeen: "" });
  t.attempts += 1;
  if (!solved) t.fails += 1;
  t.lastSeen = localDate();
  s.history = [...s.history, { date: localDate(), puzzleId, theme, solved }].slice(-200);
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(s, null, 2));
  return s;
}

/** Weak themes weigh more: (fails+1)/(attempts+2). */
export const weight = (t?: { attempts: number; fails: number }): number => ((t?.fails ?? 0) + 1) / ((t?.attempts ?? 0) + 2);

/** Deterministic per-day pick (rand in [0,1)) so the same puzzle shows all day. */
export function pickTheme(state: ChessState, rand: number): string {
  const ws = THEMES.map((t) => weight(state.themes[t]));
  let r = rand * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < THEMES.length; i++) { r -= ws[i] ?? 0; if (r < 0) return THEMES[i] ?? "fork"; }
  return THEMES[0];
}

/** Small seeded PRNG (mulberry32) from a string seed. */
export function seeded(seed: string): () => number {
  let h = 1779033703;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
