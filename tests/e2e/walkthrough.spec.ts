import { expect, test } from "@playwright/test";
import { next, back, reset, startWalk } from "./helpers";

test.beforeEach(() => reset());

test("intro screen: brand, clock, core and Microsoft hint", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Kip/i);
  await expect(page.locator(".brand")).toContainText("Kip");
  await expect(page.getByRole("button", { name: /TAP TO BEGIN/ })).toBeEnabled();
  await expect(page.getByText("Press the core to start")).toBeVisible();
  await expect(page.locator(".clock b")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(page.getByText("Microsoft: set KIP_MS_CLIENT_ID")).toBeVisible();
  await expect(page.locator(".banner")).toHaveCount(0); // a real briefing, not the sample
  await expect(page.locator(".pip")).toHaveCount(6); // warm-up, meetings, email, work, world, today
});

test("the progress pips are centred on the page, whatever is in the header corners", async ({ page }) => {
  for (const width of [1910, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const box = (await page.locator(".pips").boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
  }
});

test("walks every section in the fixed order, one slide at a time", async ({ page }) => {
  await startWalk(page);
  const counters: string[] = [];
  const headings: string[] = [];
  for (let i = 0; i < 20; i++) {
    counters.push((await page.locator(".count").innerText()).trim());
    headings.push((await page.locator(".panel-head h2").innerText()).replace(/^\S+\s/, "").trim());
    if (await page.getByRole("button", { name: /^Finish/ }).count()) break;
    await next(page).click();
  }
  expect(counters).toEqual([
    "Warm-up", "Warm-up", "Warm-up", // puzzle, notes (none), add-a-note
    "Today's meetings · 1 of 1",
    "Email",
    "Job-critical · 1 of 2", "Job-critical · 2 of 2",
    "World news · 1 of 2", "World news · 2 of 2",
    "Today's plan",
  ]);
  // headings are upper-cased by CSS, so compare case-insensitively
  expect(headings.filter((h, i) => h !== headings[i - 1]).map((h) => h.toLowerCase())).toEqual(["warm-up", "today's meetings", "email", "job-critical", "world news", "today's plan"]);
});

test("Next button announces the next section when the group changes", async ({ page }) => {
  await startWalk(page);
  await expect(next(page)).toHaveText("Next →");
  await next(page).click(); // notes status
  await next(page).click(); // add a note
  await expect(next(page)).toHaveText("Next: Today's meetings →");
});

test("puzzle slide links to Lichess in a new tab", async ({ page }) => {
  await startWalk(page);
  await expect(page.getByRole("heading", { name: "fork" })).toBeVisible();
  const link = page.getByRole("link", { name: /Open puzzle on Lichess/ });
  await expect(link).toHaveAttribute("href", "https://lichess.org/training/fork");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("meeting, work and world slides show their details", async ({ page }) => {
  await startWalk(page);
  await page.getByTitle("Today's meetings").click();
  await expect(page.getByRole("heading", { name: "Sample stand-up" })).toBeVisible();
  await page.getByTitle("Job-critical").click();
  await expect(page.getByRole("heading", { name: /Sample release/ })).toBeVisible();
  await expect(page.locator(".tag-release")).toBeVisible();
  await expect(page.getByRole("link", { name: "Read on example.com ↗" })).toHaveAttribute("href", "https://example.com/release");
  await expect(page.locator(".facts")).toContainText("example.com");
  await page.getByTitle("World news").click();
  await expect(page.getByRole("heading", { name: "World story one" })).toBeVisible();
  await expect(page.locator(".slide-sum")).toHaveText("Something happened.");
  await next(page).click();
  await expect(page.getByRole("heading", { name: "Politics story two" })).toBeVisible();
  await expect(page.getByText("No details in the feed")).toBeVisible();
});

test("email section that is not set up shows a status card", async ({ page }) => {
  await startWalk(page);
  await page.getByTitle("Email").click();
  await expect(page.getByRole("heading", { name: "Not set up yet" })).toBeVisible();
  await expect(page.getByText("Connect Microsoft in the header to see email.")).toBeVisible();
});

test("keyboard: arrows move, Escape finishes, Back is disabled on the first slide", async ({ page }) => {
  await startWalk(page);
  await expect(back(page)).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".panel-head .core")).toContainText("2/10");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".panel-head .core")).toContainText("1/10");
  await page.keyboard.press("Enter");
  await expect(page.locator(".panel-head .core")).toContainText("2/10");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".orb")).toHaveCount(7);
});

test("Back button and pips navigate", async ({ page }) => {
  await startWalk(page);
  await next(page).click();
  await back(page).click();
  await expect(page.getByRole("heading", { name: "fork" })).toBeVisible();
  await page.getByTitle("World news").click();
  await expect(page.locator(".pip.on")).toHaveAttribute("title", "World news");
  await expect(page.locator(".pip.seen")).toHaveCount(4);
});

test("Finish leads to the spread-out summary; orbs open sections; Replay restarts", async ({ page }) => {
  await startWalk(page);
  await page.getByTitle("Today's plan").click();
  await next(page).click(); // Finish
  const orbs = page.locator(".orb");
  await expect(orbs).toHaveCount(7);
  await expect(orbs.filter({ hasText: "Email" })).toHaveClass(/not_configured/);
  await expect(orbs.filter({ hasText: "Email" })).toContainText("–");
  await expect(orbs.filter({ hasText: "World news" })).toContainText("2");
  await orbs.filter({ hasText: "World news" }).click();
  await expect(page.getByRole("heading", { name: "World story one" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Replay briefing/ }).click();
  await expect(page.getByRole("heading", { name: "fork" })).toBeVisible();
});

test("a group opened from the summary can be closed with the ✕ Close button", async ({ page }) => {
  await startWalk(page);
  await page.keyboard.press("Escape");
  await page.locator(".orb", { hasText: "Job-critical" }).click();
  await expect(page.getByRole("heading", { name: /Sample release/ })).toBeVisible();
  await page.getByRole("button", { name: "✕ Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".orb")).toHaveCount(7);
});

test("summary pips and the notes core open their panels", async ({ page }) => {
  await startWalk(page);
  await page.keyboard.press("Escape");
  await page.getByTitle("Email").click();
  await expect(page.getByRole("dialog", { name: "Email" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".center .core").click();
  await expect(page.getByRole("dialog", { name: "Warm-up" })).toBeVisible();
});

test("Warm-up tabs switch between brain teaser and notes", async ({ page }) => {
  await startWalk(page);
  const notesTab = page.getByRole("tab", { name: /Previous notes/ });
  const teaserTab = page.getByRole("tab", { name: /Brain teaser/ });
  await expect(teaserTab).toHaveAttribute("aria-selected", "true");
  await notesTab.click();
  await expect(notesTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Nothing to show" })).toBeVisible();
  await teaserTab.click();
  await expect(page.getByRole("heading", { name: "fork" })).toBeVisible();
});

test("Escape inside the note box does not end the walkthrough", async ({ page }) => {
  await startWalk(page);
  await page.getByRole("tab", { name: /Previous notes/ }).click();
  await next(page).click(); // add a note
  const box = page.getByPlaceholder(/Type or speak a note/);
  await box.focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
});
