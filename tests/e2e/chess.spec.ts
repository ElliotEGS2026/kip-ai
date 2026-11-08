import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dataDir, next, reset, startWalk, TODAY } from "./helpers";

interface Hist { puzzleId: string; theme: string; outcome?: string; solved: boolean; seconds?: number; index?: number; date: string }
const chessFile = () => JSON.parse(fs.readFileSync(path.join(dataDir(), "chess-weaknesses.json"), "utf8")) as { themes: Record<string, { attempts: number; fails: number; skips?: number }>; history: Hist[] };

test("three different puzzles come one after another, each with its own Lichess link", async ({ page }) => {
  reset();
  await startWalk(page);
  const seen: string[] = [];
  for (let n = 1; n <= 3; n++) {
    await expect(page.locator(".count")).toHaveText(`Brain teaser · puzzle ${n} of 3`);
    await expect(page.locator(".kicker")).toContainText(`Puzzle ${n} of 3`);
    seen.push((await page.locator(".slide-title").innerText()).toLowerCase());
    const href = await page.getByRole("link", { name: /Open puzzle on Lichess/ }).getAttribute("href");
    expect(href).toBe(`https://lichess.org/training/${["fork", "pin", "mateIn2"][n - 1]}`);
    if (n < 3) await next(page).click();
  }
  expect(new Set(seen).size).toBe(3); // all different
  await next(page).click();
  await expect(page.getByRole("heading", { name: "Nothing to show" })).toBeVisible(); // then on to the notes
});

test("the summary circle counts the three puzzles", async ({ page }) => {
  reset();
  await startWalk(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".orb", { hasText: "Brain teaser" })).toContainText("3");
});

test("each answer is recorded with how it went, how long it took, and which puzzle it was", async ({ page }) => {
  reset();
  await startWalk(page);
  await page.waitForTimeout(1200); // time spent on the puzzle
  await page.getByRole("button", { name: "✔ Solved it" }).click();
  await expect(page.getByTestId("puzzle-result")).toContainText("Solved ✔ recorded");
  await next(page).click();
  await page.getByRole("button", { name: "◐ Solved with help" }).click();
  await expect(page.getByTestId("puzzle-result")).toContainText("Solved with help");
  await next(page).click();
  await page.getByRole("button", { name: "✗ Missed it" }).click();
  await expect(page.getByTestId("puzzle-result")).toContainText("Missed");
  const s = chessFile();
  expect(s.history.map((h) => [h.puzzleId, h.outcome, h.index])).toEqual([["sample-fork", "solved", 1], ["sample-pin", "helped", 2], ["sample-mateIn2", "missed", 3]]);
  expect(s.history[0]!.seconds).toBeGreaterThanOrEqual(1);
  expect(s.history.every((h) => h.date === TODAY)).toBe(true);
  expect(s.themes.fork).toMatchObject({ attempts: 1, fails: 0 });
  expect(s.themes.pin).toMatchObject({ attempts: 1, fails: 0.5 });
  expect(s.themes.mateIn2).toMatchObject({ attempts: 1, fails: 1 });
});

test("Skip counts neither for nor against you", async ({ page }) => {
  reset();
  await startWalk(page);
  await page.getByRole("button", { name: "⏭ Skip" }).click();
  await expect(page.getByTestId("puzzle-result")).toContainText("Skipped");
  await expect.poll(() => chessFile().themes.fork).toMatchObject({ attempts: 0, fails: 0, skips: 1 });
  expect(chessFile().history[0]).toMatchObject({ outcome: "skipped", solved: false });
});

test("an answer can be changed, and replaces the earlier one instead of counting twice", async ({ page }) => {
  reset();
  await startWalk(page);
  await page.getByRole("button", { name: "✗ Missed it" }).click();
  await expect(page.getByTestId("puzzle-result")).toContainText("Missed");
  await page.getByRole("button", { name: "Change answer" }).click();
  await page.getByRole("button", { name: "✔ Solved it" }).click();
  await expect(page.getByTestId("puzzle-result")).toContainText("Solved ✔ recorded");
  await expect.poll(() => chessFile().themes.fork).toMatchObject({ attempts: 1, fails: 0 });
  expect(chessFile().history).toHaveLength(1);
});

test("coming back to a puzzle you already answered shows that answer", async ({ page }) => {
  reset();
  await startWalk(page);
  await page.getByRole("button", { name: "◐ Solved with help" }).click();
  await expect(page.getByTestId("puzzle-result")).toBeVisible();
  await startWalk(page); // reload the page: a fresh visit
  await expect(page.getByTestId("puzzle-result")).toContainText("Solved with help");
  await expect(page.getByRole("button", { name: "✗ Missed it" })).toHaveCount(0);
  await next(page).click();
  await expect(page.getByTestId("puzzle-result")).toHaveCount(0); // the second puzzle is still unanswered
});
