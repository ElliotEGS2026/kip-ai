import { THEMES, pickTheme, readChess, seeded } from "../../shared/chessState.js";
import type { Collector } from "../types.js";

/**
 * v1: pick today's theme weighted towards weak themes (seeded by date so it is stable all day)
 * and link to Lichess's themed trainer. No puzzle API is called (endpoint shapes UNVERIFIED), so this never fails.
 */
export const chess: Collector = async ({ today }) => {
  const theme = pickTheme(readChess(), seeded(`chess-${today}`)());
  if (!THEMES.includes(theme as (typeof THEMES)[number])) throw new Error("bad theme");
  return { puzzle: { id: `${today}-${theme}`, theme, url: `https://lichess.org/training/${theme}`, themes: [theme] } };
};
