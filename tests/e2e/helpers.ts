import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { MAIN } from "../../playwright.config";

const localDate = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const TODAY = localDate();
const daysAgo = (n: number): string => localDate(new Date(Date.now() - n * 86400000));

export const dataDir = (root = MAIN.root): string => path.join(root, "data");
export const configDir = (root = MAIN.root): string => path.join(root, "config");

export interface Seed {
  /** Raw note bodies written to today's notes file, oldest first. */
  notes?: string[];
  /** Override section status for a section id. */
  statuses?: Record<string, { status: "error" | "not_configured"; message: string }>;
}

/** Wipes the data/config dirs and writes a known briefing for today (+ optional notes). */
export function reset(seed: Seed = {}, root = MAIN.root): void {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(dataDir(root), "briefings"), { recursive: true });
  fs.mkdirSync(path.join(dataDir(root), "notes"), { recursive: true });
  fs.mkdirSync(configDir(root), { recursive: true });
  fs.writeFileSync(path.join(configDir(root), "blocklist.md"), "# Blocklist\n\n## Outlets\n\n## Topics\n");
  fs.writeFileSync(path.join(configDir(root), "sources.md"), "# Sources\n\n## Favourites\n\n## Favourite topics\n");

  const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "briefing.sample.json"), "utf8")) as {
    sections: { id: string; [k: string]: unknown }[];
  };
  const sections = fixture.sections.map((s) => {
    if (s.id === "world") {
      return { ...s, status: "ok", message: undefined, items: [
        { id: "x1", title: "World story one", summary: "Something happened.", url: "https://news.example.org/one", date: daysAgo(1), source: "news.example.org", tag: "world" },
        { id: "x2", title: "Politics story two", url: "https://news.example.org/two", date: daysAgo(2), tag: "politics" },
      ] };
    }
    const o = seed.statuses?.[s.id];
    return o ? { ...s, ...o, items: [] } : s;
  });
  fs.writeFileSync(path.join(dataDir(root), "briefings", `${TODAY}.json`), JSON.stringify({ ...fixture, date: TODAY, sample: undefined, sections }));
  if (seed.notes?.length) {
    const body = seed.notes.map((t, i) => `### 09:${String(10 + i).padStart(2, "0")}\n${t}\n\n`).join("");
    fs.writeFileSync(path.join(dataDir(root), "notes", `${TODAY}.md`), body);
  }
}

export const readConfig = (file: string, root = MAIN.root): string => fs.readFileSync(path.join(configDir(root), file), "utf8");

/** Opens the app and presses the core to start the walkthrough. */
export async function startWalk(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /TAP TO BEGIN/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

export const next = (page: Page) => page.getByRole("button", { name: /^(Next|Finish)/ });
export const back = (page: Page) => page.getByRole("button", { name: "← Back" });
