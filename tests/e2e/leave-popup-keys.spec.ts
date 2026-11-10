import { expect, test } from "@playwright/test";
import { next, reset, startWalk, toNotesTab } from "./helpers";

test.beforeEach(() => reset({ notes: ["Call the bank"] }));

test("leave popup: Escape and arrow keys act on the popup, not the slide behind it", async ({ page }) => {
  await startWalk(page);
  await toNotesTab(page);
  const counter = page.locator(".count");
  await expect(counter).toContainText("Notes · page 1 of 1");
  await next(page).click();
  await expect(page.getByTestId("leave-popup")).toBeVisible();
  await expect(page.getByTestId("leave-stay")).toBeFocused(); // safe choice is focused first
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("leave-popup")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("leave-popup")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible(); // the walkthrough did not end
  await expect(counter).toContainText("Notes · page 1 of 1");
});

test("leave popup shows once per walkthrough, never in a reopened panel, and again after Replay", async ({ page }) => {
  await startWalk(page);
  await toNotesTab(page);
  await next(page).click();
  await expect(page.getByTestId("leave-popup")).toBeVisible();
  await page.getByTestId("leave-keep").click();
  await page.getByRole("tab", { name: /Previous notes/ }).click(); // back to the notes page
  await next(page).click();
  await expect(page.getByTestId("leave-popup")).toHaveCount(0); // already asked this walkthrough
  for (let i = 0; i < 40 && !(await page.getByRole("button", { name: /^Finish/ }).count()); i++) await next(page).click();
  await page.getByRole("button", { name: /^Finish/ }).click();
  await page.getByRole("button", { name: "View notes" }).click(); // notes panel from the summary
  await next(page).click();
  await expect(page.getByTestId("leave-popup")).toHaveCount(0); // panels never ask
  await page.getByRole("button", { name: /✕ Close/ }).click();
  await page.getByRole("button", { name: /Replay briefing/ }).click();
  await toNotesTab(page);
  await next(page).click();
  await expect(page.getByTestId("leave-popup")).toBeVisible(); // a new walkthrough asks again
});
