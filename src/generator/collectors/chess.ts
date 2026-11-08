import { THEMES, pickThemes, readChess, seeded } from "../../shared/chessState.js";
import type { Collector } from "../types.js";

export const PUZZLES_PER_DAY = 3;

/**
 * Today's brain teasers: `PUZZLES_PER_DAY` different themes in a row, weighted towards the themes you miss (stable all day: seeded by date),
 * each linking to Lichess's themed trainer. No puzzle API is called (endpoint shapes UNVERIFIED), so this never fails.
 */
export const chess: Collector = async ({ today }) => {
  const themes = pickThemes(readChess(), seeded(`chess-${today}`), PUZZLES_PER_DAY);
  if (themes.some((t) => !THEMES.includes(t as (typeof THEMES)[number]))) throw new Error("bad theme");
  const puzzles = themes.map((theme) => ({ id: `${today}-${theme}`, theme, url: `https://lichess.org/training/${theme}`, themes: [theme] }));
  return { puzzle: puzzles[0], puzzles };
};
