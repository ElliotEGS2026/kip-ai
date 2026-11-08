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
