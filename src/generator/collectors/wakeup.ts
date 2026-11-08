import fs from "node:fs";
import path from "node:path";
import { seeded } from "../../shared/chessState.js";
import { configDir } from "../../shared/paths.js";
import { NotConfigured, type Collector } from "../types.js";

export const wakeup: Collector = async ({ today }) => {
  const file = path.join(configDir(), "wakeup.md");
  const ideas = fs.existsSync(file) ? [...fs.readFileSync(file, "utf8").matchAll(/^-\s+(.+)$/gm)].map((m) => m[1]!.trim()) : [];
  if (ideas.length === 0) throw new NotConfigured("Add bullet ideas to config/wakeup.md.");
  const rand = seeded(`wake-${today}`);
  const pool = [...ideas];
  const picks: string[] = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
  return { items: picks.map((t, i) => ({ id: `wake-${i}`, title: t })) };
};
