import { expect, test } from "@playwright/test";
import { readConfig, reset, startWalk } from "./helpers";

test.beforeEach(() => reset());

const stats = async (page: import("@playwright/test").Page): Promise<string> => {
  const token = await page.locator('meta[name="kip-token"]').getAttribute("content");
  const r = await page.request.get("/api/puzzle-stats", { headers: { "x-kip-token": token ?? "" } });
  expect(r.ok()).toBe(true);
  return JSON.stringify(await r.json());
};

test("👍 on a world item adds the outlet to Favourites in sources.md", async ({ page }) => {
  await startWalk(page);
  await page.getByTitle("World news").click();
  await page.getByRole("button", { name: /More like this/ }).click();
  await expect(page.getByText("★ saved")).toBeVisible();
  await expect(page.getByRole("button", { name: /Block source/ })).toHaveCount(0);
  expect(readConfig("sources.md")).toMatch(/## Favourites\r?\n- news\.example\.org/);
});

test("👎 on a world item blocks the outlet in blocklist.md", async ({ page }) => {
  await startWalk(page);
  await page.getByTitle("World news").click();
  await page.getByRole("button", { name: /Block source/ }).click();
  await expect(page.getByText("blocked")).toBeVisible();
  expect(readConfig("blocklist.md")).toMatch(/## Outlets\r?\n- news\.example\.org/);
});

test("Block topic keeps the source and blocks the chosen subject in blocklist.md", async ({ page }) => {
  await startWalk(page);
  await page.getByTitle("World news").click();
  await page.getByRole("button", { name: /Block topic/ }).click();
  const picker = page.getByTestId("topic-picker");
  await expect(picker).toBeVisible();
  await expect(page.getByTestId("topic-input")).toBeFocused();
  await picker.getByRole("button", { name: "story" }).click(); // a suggestion from the headline “World story one”
  await expect(page.getByTestId("topic-input")).toHaveValue("story");
  await page.keyboard.press("ArrowRight"); // typing keys stay in the box, the slide doesn't move
  await expect(page.locator(".count")).toContainText("1 of");
  await page.getByTestId("topic-input").fill("  Middle   East ");
  await page.getByTestId("topic-input").press("Enter");
  await expect(page.getByText("Topic “middle east” blocked")).toBeVisible();
  const block = readConfig("blocklist.md");
  expect(block).toMatch(/## Topics\r?\n- middle east/);
  expect(block).not.toMatch(/## Outlets\r?\n- news\.example\.org/); // the source is not blocked
});

test("Block topic: Cancel and Escape close the picker without saving; too-short topics are refused", async ({ page }) => {
  await startWalk(page);
  await page.getByTitle("World news").click();
  await page.getByRole("button", { name: /Block topic/ }).click();
  await page.getByTestId("topic-input").fill("ab");
  await page.getByTestId("topic-block").click();
  await expect(page.getByTestId("topic-picker")).toContainText("at least 3 letters");
  await page.getByTestId("topic-input").press("Escape");
  await expect(page.getByTestId("topic-picker")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible(); // Escape closed only the picker
  await page.getByRole("button", { name: /Block topic/ }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("topic-picker")).toHaveCount(0);
  expect(readConfig("blocklist.md")).toMatch(/## Topics\s*$/);
});

test("feedback buttons appear on job-critical items, but not on meetings", async ({ page }) => {
  await startWalk(page);
  await page.getByTitle("Job-critical").click();
  await expect(page.getByRole("button", { name: /More like this/ })).toBeVisible();
  await page.getByTitle("Today's meetings").click();
  await expect(page.getByRole("button", { name: /More like this/ })).toHaveCount(0);
});

test("giving the same feedback on two items from one outlet does not duplicate the bullet", async ({ page }) => {
  await startWalk(page);
  await page.getByTitle("World news").click();
  await page.getByRole("button", { name: /More like this/ }).click();
  await expect(page.getByText("★ saved")).toBeVisible();
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByRole("button", { name: /More like this/ }).click();
  await expect(page.getByText("★ saved")).toBeVisible();
  expect(readConfig("sources.md").match(/news\.example\.org/g)).toHaveLength(1);
});

test("puzzle: Solved it is recorded", async ({ page }) => {
  await startWalk(page);
  await page.getByRole("button", { name: "✔ Solved it" }).click();
  await expect(page.getByText("Solved ✔ recorded")).toBeVisible();
  await expect(page.getByRole("button", { name: "✗ Missed it" })).toHaveCount(0);
  expect(await stats(page)).toBeTruthy();
});

test("puzzle: Missed it is recorded with a note about more of that theme", async ({ page }) => {
  await startWalk(page);
  await page.getByRole("button", { name: "✗ Missed it" }).click();
  await expect(page.getByText("Missed — we'll show more of this theme")).toBeVisible();
  expect(await stats(page)).toContain("fork");
});
