import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { dataDir, next, reset, startWalk, TODAY } from "./helpers";

const items = (page: Page) => page.getByTestId("note-item");
const stateFile = (): Record<string, { completed?: boolean; priority?: boolean; deleted?: boolean }> =>
  JSON.parse(fs.readFileSync(path.join(dataDir(), "note-state.json"), "utf8"));
async function toNotes(page: Page): Promise<void> {
  await startWalk(page);
  await next(page).click();
  await expect(page.getByRole("heading", { name: /Your notes/ })).toBeVisible();
}

test.describe("with two saved notes", () => {
  test.beforeEach(() => reset({ notes: ["Alpha note\nmore detail here", "Beta note"] }));

  test("lists notes newest first with details, none completed by default", async ({ page }) => {
    await toNotes(page);
    await expect(items(page)).toHaveCount(2);
    await expect(page.getByTestId("note-text").nth(0)).toContainText("Beta note");
    await expect(page.getByTestId("note-text").nth(1)).toContainText("Alpha note — more detail here");
    await expect(page.getByTestId("note-text").nth(1)).toContainText(TODAY);
    await expect(page.getByTestId("note-completed").first()).not.toBeChecked();
    await expect(page.locator(".count")).toHaveText("Notes · page 1 of 1");
  });

  test("priority toggles, is saved and floats the note to the top after reload", async ({ page }) => {
    await toNotes(page);
    const alpha = items(page).nth(1);
    await alpha.getByTestId("note-priority").click();
    await expect(alpha.getByTestId("note-priority")).toHaveAttribute("aria-pressed", "true");
    await expect(alpha.getByTestId("note-priority")).toHaveText("⭐ Priority");
    await expect.poll(() => Object.values(stateFile()).some((s) => s.priority === true)).toBe(true);
    await toNotes(page);
    await expect(page.getByTestId("note-text").first()).toContainText("Alpha note");
    await expect(page.getByTestId("note-text").first()).toContainText("⭐");
    await items(page).first().getByTestId("note-priority").click();
    await expect(items(page).first().getByTestId("note-priority")).toHaveAttribute("aria-pressed", "false");
  });

  test("completing strikes the note out and offers delete; delete removes it for good", async ({ page }) => {
    await toNotes(page);
    const beta = items(page).first();
    await expect(beta.getByTestId("note-delete")).toHaveCount(0);
    await beta.getByTestId("note-completed").check();
    await expect(beta).toHaveClass(/is-done/);
    await beta.getByTestId("note-delete").click();
    await expect(items(page)).toHaveCount(1);
    await expect.poll(() => Object.values(stateFile()).some((s) => s.deleted === true && s.completed === true)).toBe(true);
    await toNotes(page);
    await expect(items(page)).toHaveCount(1);
    await expect(page.getByTestId("note-text")).toContainText("Alpha note");
  });

  test("un-ticking Completed restores the note", async ({ page }) => {
    await toNotes(page);
    const beta = items(page).first();
    await beta.getByTestId("note-completed").check();
    await beta.getByTestId("note-completed").uncheck();
    await expect(beta).not.toHaveClass(/is-done/);
    await expect(beta.getByTestId("note-delete")).toHaveCount(0);
  });

  test("leaving with uncompleted notes asks first; Stay keeps you on the page", async ({ page }) => {
    await toNotes(page);
    await next(page).click();
    const popup = page.getByTestId("leave-popup");
    await expect(popup).toContainText("2 notes aren't completed");
    await expect(popup).toContainText("Beta note");
    await page.getByTestId("leave-stay").click();
    await expect(popup).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Your notes/ })).toBeVisible();
  });

  test("Keep for later moves on without completing", async ({ page }) => {
    await toNotes(page);
    await next(page).click();
    await page.getByTestId("leave-keep").click();
    await expect(page.getByRole("heading", { name: "Add a new note" })).toBeVisible();
    await expect(page.getByTestId("leave-popup")).toHaveCount(0);
    await toNotes(page);
    await expect(page.getByTestId("note-completed").first()).not.toBeChecked();
  });

  test("Mark completed completes every open note and moves on", async ({ page }) => {
    await toNotes(page);
    await next(page).click();
    await page.getByTestId("leave-complete").click();
    await expect(page.getByRole("heading", { name: "Add a new note" })).toBeVisible();
    await expect.poll(() => Object.values(stateFile()).filter((s) => s.completed).length).toBe(2);
  });

  test("popup also appears for ✕ Close, with singular wording for one open note", async ({ page }) => {
    await toNotes(page);
    await items(page).first().getByTestId("note-completed").check();
    await page.getByRole("button", { name: "✕ Close" }).click();
    await expect(page.getByTestId("leave-popup")).toContainText("1 note isn't completed");
    await page.getByTestId("leave-keep").click();
    await expect(page.locator(".orb")).toHaveCount(7);
  });

  test("no popup once every note is completed", async ({ page }) => {
    await toNotes(page);
    for (const box of await page.getByTestId("note-completed").all()) await box.check();
    await next(page).click();
    await expect(page.getByTestId("leave-popup")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Add a new note" })).toBeVisible();
  });

  test("Edit opens the note text, Done saves the change", async ({ page }) => {
    await toNotes(page);
    const beta = items(page).first();
    await beta.getByTestId("note-edit").click();
    const box = page.getByTestId("note-edit-box");
    await expect(box).toHaveValue("Beta note");
    await expect(beta.getByTestId("note-edit")).toHaveText("✓ Done");
    await box.fill("Beta note edited\nwith more detail");
    await beta.getByTestId("note-edit").click();
    await expect(page.getByTestId("note-edit-box")).toHaveCount(0);
    await expect(page.getByTestId("note-text").first()).toContainText("Beta note edited — with more detail");
    const file = fs.readFileSync(path.join(dataDir(), "notes", `${TODAY}.md`), "utf8");
    expect(file).toContain("Beta note edited\nwith more detail");
    expect(file).not.toMatch(/\nBeta note\n/);
    expect(file).toContain("Alpha note\nmore detail here"); // other notes untouched
    await toNotes(page); // persists
    await expect(items(page)).toHaveCount(2);
    await expect(page.getByTestId("note-text").first()).toContainText("Beta note edited");
  });

  test("editing keeps the note's priority and completed choices", async ({ page }) => {
    await toNotes(page);
    const beta = items(page).first();
    await beta.getByTestId("note-priority").click();
    await expect.poll(() => Object.values(stateFile()).some((s) => s.priority)).toBe(true);
    await beta.getByTestId("note-edit").click();
    await page.getByTestId("note-edit-box").fill("Beta renamed");
    await beta.getByTestId("note-edit").click();
    await toNotes(page);
    await expect(page.getByTestId("note-text").first()).toContainText("Beta renamed");
    await expect(page.getByTestId("note-text").first()).toContainText("⭐");
  });

  test("an edit in progress is saved when you leave the page", async ({ page }) => {
    await toNotes(page);
    await items(page).first().getByTestId("note-edit").click();
    await page.getByTestId("note-edit-box").fill("Changed without pressing Done");
    await page.getByRole("button", { name: "✕ Close" }).click();
    await page.getByTestId("leave-keep").click();
    await expect.poll(() => fs.readFileSync(path.join(dataDir(), "notes", `${TODAY}.md`), "utf8")).toContain("Changed without pressing Done");
  });

  test("Done without changes, or with an emptied box, leaves the note as it was", async ({ page }) => {
    await toNotes(page);
    const file = path.join(dataDir(), "notes", `${TODAY}.md`);
    const before = fs.readFileSync(file, "utf8");
    const beta = items(page).first();
    await beta.getByTestId("note-edit").click();
    await beta.getByTestId("note-edit").click();
    await beta.getByTestId("note-edit").click();
    await page.getByTestId("note-edit-box").fill("   ");
    await beta.getByTestId("note-edit").click();
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  test("keyboard arrow does not skip past the notes page", async ({ page }) => {
    await toNotes(page);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: /Your notes/ })).toBeVisible();
  });
});

test.describe("adding notes", () => {
  test.beforeEach(() => reset());

  const toCapture = async (page: Page) => { await startWalk(page); await next(page).click(); await next(page).click(); };
  const notesFile = () => path.join(dataDir(), "notes", `${TODAY}.md`);

  test("there is no Save button; the note is saved automatically when you leave the page", async ({ page }) => {
    await toCapture(page);
    await expect(page.getByRole("button", { name: "Save note" })).toHaveCount(0);
    await expect(page.locator(".autosave")).toContainText("Saved automatically");
    await page.getByPlaceholder(/Type or speak a note/).fill("Call the plumber\nabout the boiler");
    expect(fs.existsSync(notesFile())).toBe(false); // not yet: still on the page
    await next(page).click(); // leave -> saved
    await expect.poll(() => fs.existsSync(notesFile()) && fs.readFileSync(notesFile(), "utf8")).toMatch(/### \d{2}:\d{2}\nCall the plumber\nabout the boiler/);
    await expect(page.getByRole("heading", { name: "Sample stand-up" })).toBeVisible(); // and we moved on, not pulled back
  });

  test("leaving with Back shows the new note in the notes list", async ({ page }) => {
    await toCapture(page);
    await page.getByPlaceholder(/Type or speak a note/).fill("Order more coffee");
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByTestId("note-text")).toContainText("Order more coffee");
    await expect(page.getByRole("heading", { name: /Your notes/ })).toBeVisible();
  });

  test("closing the walkthrough also saves the draft; an empty draft saves nothing", async ({ page }) => {
    await toCapture(page);
    await page.getByPlaceholder(/Type or speak a note/).fill("Saved on close");
    await page.getByRole("button", { name: "✕ Close" }).click();
    await expect.poll(() => fs.existsSync(notesFile()) && fs.readFileSync(notesFile(), "utf8")).toContain("Saved on close");
    reset();
    await toCapture(page);
    await page.getByPlaceholder(/Type or speak a note/).fill("   ");
    await next(page).click();
    await expect(page.getByRole("heading", { name: "Sample stand-up" })).toBeVisible();
    expect(fs.existsSync(notesFile())).toBe(false);
  });

  test("the voice control or its fallback message is shown", async ({ page }) => {
    await startWalk(page);
    await next(page).click();
    await next(page).click();
    await expect(page.getByRole("button", { name: /Speak/ }).or(page.getByText("Voice dictation isn't available"))).toBeVisible();
  });
});

test.describe("tasks and paging", () => {
  test("an open loop is shown as a task without Completed controls and lands in today's plan", async ({ page }) => {
    reset({ notes: ["Planning\n- [ ] send the spec"] });
    await toNotes(page);
    const task = items(page).filter({ hasText: "write “- [x] …” in a note to close" });
    await expect(task).toContainText("task");
    await expect(task.getByTestId("note-completed")).toHaveCount(0);
    await expect(task).toContainText("write “- [x] …” in a note to close");
    await page.getByTitle("Today's plan").click();
    await expect(page.getByTestId("plan-task")).toContainText("send the spec");
  });

  test("a priority note appears in today's plan with a star", async ({ page }) => {
    reset({ notes: ["Ring the bank"] });
    await toNotes(page);
    await items(page).first().getByTestId("note-priority").click();
    await expect.poll(() => Object.values(stateFile()).some((s) => s.priority)).toBe(true);
    await startWalk(page); // fresh load: the plan is rebuilt server-side
    await page.getByTitle("Today's plan").click();
    await expect(page.getByTestId("plan-task")).toContainText("⭐ Ring the bank");
  });

  test("more than five notes are split across pages", async ({ page }) => {
    reset({ notes: Array.from({ length: 7 }, (_, i) => `Note number ${i + 1}`) });
    await toNotes(page);
    await expect(page.locator(".count")).toHaveText("Notes · page 1 of 2");
    await expect(items(page)).toHaveCount(5);
    await next(page).click();
    await page.getByTestId("leave-keep").click();
    await expect(page.locator(".count")).toHaveText("Notes · page 2 of 2");
    await expect(items(page)).toHaveCount(2);
  });
});
