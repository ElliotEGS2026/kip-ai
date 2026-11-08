import { expect, test, type Page } from "@playwright/test";
import { reset, startWalk } from "./helpers";

test.beforeEach(() => reset());

const SOLID = ".hud .brand, .pips, .hud-right, .center .core, .orb, .panel, .banner, .hint, .again";

interface Snapshot { kips: { x: number; y: number; r: number }[]; width: number; height: number; hitsBox: string[]; hitsKip: string[] }
/** Where every Kip is, and which boxes / other Kips any of them is overlapping by more than 20% of its radius. */
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate((solid) => {
  const kips = [...document.querySelectorAll<HTMLElement>('[data-testid="kip"]')].map((e) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: Number(e.dataset.r) }; });
  const boxes = [...document.querySelectorAll(solid)].map((e) => ({ name: e.className.toString().split(" ")[0] || e.tagName, b: e.getBoundingClientRect() })).filter((o) => o.b.width > 0 && o.b.height > 0);
  const hitsBox: string[] = [], hitsKip: string[] = [];
  kips.forEach((k, i) => {
    for (const { name, b } of boxes) {
      const cx = Math.min(b.right, Math.max(b.left, k.x)), cy = Math.min(b.bottom, Math.max(b.top, k.y));
      if (Math.hypot(k.x - cx, k.y - cy) < k.r * 0.8) hitsBox.push(`kip ${i} overlaps .${name}`);
    }
    kips.slice(i + 1).forEach((o, j) => { if (Math.hypot(k.x - o.x, k.y - o.y) < (k.r + o.r) * 0.8) hitsKip.push(`kip ${i} overlaps kip ${i + 1 + j}`); });
  });
  return { kips, width: window.innerWidth, height: window.innerHeight, hitsBox, hitsKip };
}, SOLID);

test("Kip's picture is served as a transparent PNG", async ({ request, page }) => {
  const r = await request.get("/kip.png");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toBe("image/png");
  await page.goto("/");
  await expect.poll(() => page.locator('[data-testid="kip"]').first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
  // the corners of the picture are see-through (the black backdrop was cut out)
  const corner = await page.evaluate(async () => {
    const img = new Image(); img.src = "/kip.png"; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    return [g.getImageData(0, 0, 1, 1).data[3], g.getImageData(img.width - 1, 0, 1, 1).data[3], g.getImageData(img.width / 2, img.height / 2, 1, 1).data[3]];
  });
  expect(corner).toEqual([0, 0, 255]);
});

test("Kips float on every screen: intro, walkthrough, summary and section panels", async ({ page }) => {
  const kips = page.getByTestId("kip");
  const crowd = async () => { const n = await kips.count(); expect(n).toBeGreaterThanOrEqual(8); expect(n).toBeLessThanOrEqual(15); };
  await page.goto("/");
  await crowd();
  await expect(page.getByRole("button", { name: /TAP TO BEGIN/ })).toBeVisible(); // still usable
  await page.getByRole("button", { name: /TAP TO BEGIN/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await crowd();
  await page.keyboard.press("Escape"); // summary screen
  await expect(page.locator(".orb")).toHaveCount(7);
  await crowd();
  await page.locator(".orb", { hasText: "World news" }).click(); // a panel opened from the summary
  await expect(page.getByRole("dialog")).toBeVisible();
  await crowd();
  for (const k of await kips.all()) await expect(k).toBeVisible();
});

test("Kips are on the background layer, behind the interface, and never block clicks", async ({ page }) => {
  await startWalk(page);
  const z = await page.evaluate(() => ({
    kips: getComputedStyle(document.querySelector(".kips")!).zIndex,
    panel: getComputedStyle(document.querySelector(".panel")!).zIndex,
    hud: getComputedStyle(document.querySelector(".hud")!).zIndex,
    events: getComputedStyle(document.querySelector(".kips")!).pointerEvents,
  }));
  expect(Number(z.kips)).toBeLessThan(Number(z.hud));
  expect(Number(z.kips)).toBeLessThan(Number(z.panel));
  expect(z.events).toBe("none");
});

test("Kips keep moving, and stay inside the window", async ({ page }) => {
  await page.goto("/");
  const first = await snapshot(page);
  await page.waitForTimeout(1500);
  const later = await snapshot(page);
  const moved = later.kips.filter((k, i) => Math.hypot(k.x - first.kips[i]!.x, k.y - first.kips[i]!.y) > 10);
  expect(moved.length).toBeGreaterThanOrEqual(Math.floor(first.kips.length * 0.8)); // a Kip that just bounced back may be near where it was
  for (let i = 0; i < 12; i++) {
    const s = await snapshot(page);
    for (const k of s.kips) { expect(k.x).toBeGreaterThanOrEqual(k.r - 1); expect(k.x).toBeLessThanOrEqual(s.width - k.r + 1); expect(k.y).toBeGreaterThanOrEqual(k.r - 1); expect(k.y).toBeLessThanOrEqual(s.height - k.r + 1); }
    await page.waitForTimeout(250);
  }
});

test("Kips bounce off the interface and off each other instead of overlapping them", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page.waitForTimeout(1500); // let them settle out of anything they started inside
  for (let i = 0; i < 20; i++) {
    const s = await snapshot(page);
    expect(s.hitsBox).toEqual([]);
    expect(s.hitsKip).toEqual([]);
    await page.waitForTimeout(200);
  }
});

test("a panel that opens over a Kip pushes him out to the side rather than leaving him in it", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await startWalk(page);
  await expect.poll(async () => (await snapshot(page)).hitsBox, { timeout: 15_000 }).toEqual([]);
  for (let i = 0; i < 10; i++) { expect((await snapshot(page)).hitsBox).toEqual([]); await page.waitForTimeout(200); }
});

test("with reduced motion the Kips hold still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect.poll(() => page.getByTestId("kip").count()).toBeGreaterThanOrEqual(8);
  const a = await snapshot(page);
  await page.waitForTimeout(1000);
  const b = await snapshot(page);
  expect(b.kips).toEqual(a.kips);
});

test("on the summary screen the Kips weave between the orbs without overlapping them", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await startWalk(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".orb")).toHaveCount(7);
  await page.waitForTimeout(2500); // orbs spread out, Kips settle
  // The gaps between the orbs can be narrower than a big Kip, so a Kip wedged in one for a moment is physically
  // unavoidable. Require that this is rare (at most 3 of 15 samples), not that it never happens.
  let bad = 0;
  for (let i = 0; i < 15; i++) {
    const s = await snapshot(page);
    if (s.hitsBox.length + s.hitsKip.length > 0) bad++;
    await page.waitForTimeout(200);
  }
  expect(bad).toBeLessThanOrEqual(3);
});

test("each visit rolls a random crowd: 8-12 big Kips, plus 0 to (15 - big) little ones, never more than 15", async ({ page }) => {
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    await page.goto("/");
    const kinds = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="kip"]')].map((e) => ({ kind: e.dataset.kind, r: Number(e.dataset.r) })));
    const big = kinds.filter((k) => k.kind === "big"), little = kinds.filter((k) => k.kind === "little");
    expect(big.length).toBeGreaterThanOrEqual(8);
    expect(big.length).toBeLessThanOrEqual(12);
    expect(kinds.length).toBeLessThanOrEqual(15);
    expect(little.length).toBeLessThanOrEqual(15 - big.length);
    for (const b of big) expect(b.r).toBeGreaterThan(Math.max(...little.map((l) => l.r), 0));
    seen.add(`${big.length}+${little.length}`);
  }
  expect(seen.size).toBeGreaterThan(1); // it really is random, not a fixed number
});

test("the icons in the summary circles are big enough to see", async ({ page }) => {
  await startWalk(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".orb")).toHaveCount(7);
  for (const ico of await page.locator(".orb-ico").all()) {
    const size = await ico.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(size).toBeGreaterThanOrEqual(30);
  }
  // and the whole orb (icon, count and title) still fits inside its circle
  for (const orb of await page.locator(".orb").all()) {
    const fits = await orb.evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1);
    expect(fits).toBe(true);
  }
});
