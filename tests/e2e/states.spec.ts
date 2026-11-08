import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { dataDir, reset, startWalk, TODAY } from "./helpers";

test("a failing section shows an error card and the rest still work", async ({ page }) => {
  reset({ statuses: { meetings: { status: "error", message: "Calendar unreachable" } } });
  await startWalk(page);
  await page.getByTitle("Today's meetings").click();
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  await expect(page.locator(".err")).toHaveText("Calendar unreachable");
  await page.getByTitle("Job-critical").click();
  await expect(page.getByRole("heading", { name: /Sample release/ })).toBeVisible();
  await page.getByTitle("Today's plan").click();
  await expect(page.getByText("⚠ Meetings failed, so it is missing from this plan.")).toBeVisible();
});

test("today's plan groups items and shows empty groups", async ({ page }) => {
  reset({ notes: ["Reminder\n- [ ] file expenses"] });
  await startWalk(page);
  await page.getByTitle("Today's plan").click();
  await expect(page.getByTestId("plan")).toContainText("Your day at a glance");
  await expect(page.getByTestId("plan-meeting")).toContainText("Sample stand-up");
  await expect(page.getByTestId("plan-meeting").locator(".plan-count")).toHaveText("1");
  await expect(page.getByTestId("plan-task")).toContainText("file expenses");
  await expect(page.getByTestId("plan-reply")).toContainText("No replies waiting");
  await expect(page.getByTestId("plan-reply")).toHaveClass(/is-empty/);
  await expect(page.getByTestId("plan-review")).toContainText("Review 2 job-critical updates");
});

test("an empty plan shows 'A clear day' with warnings", async ({ page }) => {
  reset({ statuses: { meetings: { status: "error", message: "x" }, work: { status: "error", message: "y" } } });
  await startWalk(page);
  await page.getByTitle("Today's plan").click();
  await expect(page.getByRole("heading", { name: "A clear day" })).toBeVisible();
  await expect(page.getByText(/Job-critical failed/)).toBeVisible();
});

test("without a stored briefing the sample is shown with a banner", async ({ page }) => {
  reset();
  fs.rmSync(path.join(dataDir(), "briefings", `${TODAY}.json`));
  await page.goto("/");
  await expect(page.locator(".banner")).toContainText("Sample data");
  await page.getByRole("button", { name: /TAP TO BEGIN/ }).click();
  await expect(page.getByRole("heading", { name: "fork" })).toBeVisible();
});

test("if the briefing cannot be loaded the core says OFFLINE and a banner explains", async ({ page }) => {
  reset();
  await page.route("**/api/brief/*", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
  await page.goto("/");
  await expect(page.locator(".banner.err")).toContainText("Could not load the briefing");
  await expect(page.getByRole("button", { name: /OFFLINE/ })).toBeDisabled();
});

test("a failed note-state save surfaces an error banner", async ({ page }) => {
  reset({ notes: ["Some note"] });
  await page.route("**/api/notes/state", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await startWalk(page);
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByTestId("note-completed").check();
  await expect(page.locator(".banner.err")).toContainText("Could not save your note choice");
});

test.describe("Microsoft connect widget", () => {
  test.beforeEach(() => reset());
  const mock = (page: Page, body: unknown) =>
    page.route("**/api/ms/status", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }));

  test("disconnected -> pending shows the device code", async ({ page }) => {
    await mock(page, { status: "disconnected" });
    await page.route("**/api/ms/connect", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "pending", userCode: "ABCD-1234", verificationUri: "https://microsoft.com/devicelogin" }) }));
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Microsoft" }).click();
    await expect(page.locator(".hud-right")).toContainText("ABCD-1234");
    await expect(page.getByRole("link", { name: "https://microsoft.com/devicelogin" })).toBeVisible();
  });

  test("connected offers Disconnect", async ({ page }) => {
    await mock(page, { status: "connected" });
    await page.route("**/api/ms/disconnect", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "disconnected" }) }));
    await page.goto("/");
    await page.getByRole("button", { name: /Microsoft ✔ Disconnect/ }).click();
    await expect(page.getByRole("button", { name: "Connect Microsoft" })).toBeVisible();
  });

  test("an error status shows the message on the connect button", async ({ page }) => {
    await mock(page, { status: "error", message: "denied" });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Connect Microsoft (denied)" })).toBeVisible();
  });
});
