import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dataDir, next, reset, startWalk } from "./helpers";

const seenFile = (): Record<string, string> => { try { return JSON.parse(fs.readFileSync(path.join(dataDir(), "seen.json"), "utf8")); } catch { return {}; } };

test("a fresh, unseen story is tagged new; one older than yesterday is not", async ({ page }) => {
  reset();
  await startWalk(page);
  await page.getByTitle("World news").click();
  await expect(page.getByRole("heading", { name: "World story one" })).toBeVisible(); // published yesterday
  await expect(page.locator(".tag-new")).toBeVisible();
  await next(page).click();
  await expect(page.getByRole("heading", { name: "Politics story two" })).toBeVisible(); // two days old
  await expect(page.locator(".tag-new")).toHaveCount(0);
});

test("a story you stay on is recorded as seen and shows 'seen' next time; flicking past does not count", async ({ page }) => {
  reset();
  await startWalk(page);
  await page.getByTitle("World news").click();
  await expect(page.getByRole("heading", { name: "World story one" })).toBeVisible();
  await next(page).click(); // left within the first moment: not seen
  await expect(page.getByRole("heading", { name: "Politics story two" })).toBeVisible();
  await expect.poll(() => seenFile()["x2"], { timeout: 6000 }).toBeTruthy(); // stayed here: seen
  expect(seenFile()["x1"]).toBeUndefined();
  await startWalk(page); // a new visit: the brief now flags it
  await page.getByTitle("World news").click();
  await next(page).click();
  await expect(page.locator(".tag-seen")).toBeVisible();
  await expect(page.locator(".tag-new")).toHaveCount(0);
});

test("a GitHub release says which project it is, shows its repo as the source, and lists the changes as bullets", async ({ page }) => {
  reset({ workItems: [{ id: "gh1", title: "v8.3.6", url: "https://github.com/vitejs/vite/releases/tag/v8.3.6", date: "2026-11-07", source: "github.com", tag: "release", summary: "▸ Bug Fixes • await overlapping plugin container close calls • resolve dynamic imports with queries" }] });
  await startWalk(page);
  await page.getByTitle("Job-critical").click();
  await next(page).click();
  await next(page).click();
  await expect(page.getByRole("heading", { name: "vitejs/vite v8.3.6" })).toBeVisible();
  await expect(page.locator(".facts")).toContainText("github.com/vitejs/vite");
  await expect(page.locator(".slide-sum")).toHaveText("▸ Bug Fixes");
  await expect(page.locator(".slide-bullets li")).toHaveText(["await overlapping plugin container close calls", "resolve dynamic imports with queries"]);
});

test("a release that already names its project is not prefixed twice", async ({ page }) => {
  reset({ workItems: [{ id: "gh2", title: "vitejs/vite v9.0.0", url: "https://github.com/vitejs/vite/releases/tag/v9.0.0", date: "2026-11-07", source: "github.com/vitejs/vite", tag: "release" }] });
  await startWalk(page);
  await page.getByTitle("Job-critical").click();
  await next(page).click();
  await next(page).click();
  await expect(page.getByRole("heading", { name: "vitejs/vite v9.0.0", exact: true })).toBeVisible();
});

test("each release-note bullet links to its own pull request, and the button names where it goes", async ({ page }) => {
  reset({ workItems: [{ id: "gh3", title: "v3.0.0", url: "https://github.com/acme/widget/releases/tag/v3.0.0", date: "2026-11-07", source: "github.com", tag: "release", summary: "▸ Fixes • first fix • second fix",
    points: [{ text: "first fix", url: "https://github.com/acme/widget/pull/1" }, { text: "second fix" }] }] });
  await startWalk(page);
  await page.getByTitle("Job-critical").click();
  await next(page).click();
  await next(page).click();
  await expect(page.getByRole("link", { name: "View release on GitHub ↗" })).toHaveAttribute("href", "https://github.com/acme/widget/releases/tag/v3.0.0");
  const bullets = page.locator(".slide-bullets li");
  await expect(bullets).toHaveCount(2);
  await expect(bullets.nth(0).locator("a.point-link")).toHaveAttribute("href", "https://github.com/acme/widget/pull/1");
  await expect(bullets.nth(1).locator("a.point-link")).toHaveCount(0); // that change has no page of its own
});

test("a news story's button says which site it opens, and goes to that exact article", async ({ page }) => {
  reset();
  await startWalk(page);
  await page.getByTitle("World news").click();
  const link = page.getByRole("link", { name: "Read on news.example.org ↗" });
  await expect(link).toHaveAttribute("href", "https://news.example.org/one");
  await expect(link).toHaveAttribute("target", "_blank");
});

test("a feed that failed to load shows a flagged source problem on that section's stories", async ({ page }) => {
  reset({ warnings: { world: ["news.google.com/rss/search [site:moneysavingexpert.com when:2d]: the feed returned no articles (it may have changed or be blocked)"] } });
  await startWalk(page);
  await page.getByTitle("World news").click();
  const flag = page.getByTestId("source-flag");
  await expect(flag).toContainText("Source problem");
  await expect(flag).toContainText("moneysavingexpert.com");
  await page.getByTitle("Job-critical").click();
  await expect(page.getByTestId("source-flag")).toHaveCount(0); // other sections are unaffected
});

test("a Google News story shows its real publisher on the button, and feedback goes to that publisher", async ({ page }) => {
  reset();
  await page.route("**/api/brief/*", async (route) => {
    const res = await route.fetch();
    const b = await res.json();
    const world = b.sections.find((s: { id: string }) => s.id === "world");
    world.items = [{ id: "g1", title: "Cheap broadband deals", url: "https://news.google.com/rss/articles/abc", date: b.date, source: "moneysavingexpert.com", tag: "finance" }];
    await route.fulfill({ response: res, json: b });
  });
  let sent = "";
  await page.route("**/api/feedback", async (route) => { sent = route.request().postData() ?? ""; await route.continue(); });
  await startWalk(page);
  await page.getByTitle("World news").click();
  await expect(page.getByRole("link", { name: "Read on moneysavingexpert.com ↗" })).toHaveAttribute("href", "https://news.google.com/rss/articles/abc");
  await page.getByRole("button", { name: /Block source/ }).click();
  await expect(page.getByText("blocked")).toBeVisible();
  expect(JSON.parse(sent).value).toBe("moneysavingexpert.com"); // not news.google.com
});
