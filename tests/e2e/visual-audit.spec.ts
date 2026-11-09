import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { next, reset, startWalk, TODAY } from "./helpers";

/**
 * Layout audit: walks every slide at phone → desktop sizes with deliberately awkward content and checks that nothing
 * is clipped, unreachable, off-screen or overflowing. Set KIP_SHOTS=<dir> to also save a screenshot of every screen.
 */
const SHOTS = process.env.KIP_SHOTS;
const VIEWPORTS = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "laptop-1366", width: 1366, height: 768 },
  { name: "short-1280x600", width: 1280, height: 600 },
  { name: "tablet-820", width: 820, height: 1180 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-small-320", width: 320, height: 568 },
  { name: "ultrawide-2560x720", width: 2560, height: 720 },
];

const LONG = "An extraordinarily long headline that keeps going so we can see how the slide copes when a feed returns something far wider and taller than the happy path ever shows";
const longPoints = Array.from({ length: 12 }, (_, i) => ({ text: `${i % 5 === 0 ? "▸ " : ""}Change number ${i + 1}: something fairly detailed that wraps onto a second line when the panel is narrow enough to force it`, url: "https://example.org/change" }));
const notes = Array.from({ length: 26 }, (_, i) => (i % 7 === 0 ? `${LONG} ${LONG}` : `Note ${i + 1} — remember to do the thing${i % 3 === 0 ? " (with a supercalifragilisticexpialidocious_unbroken_token_that_never_wraps_naturally_in_a_row)" : ""}`));

interface Finding { vp: string; screen: string; problem: string }
const findings: Finding[] = [];

async function inspect(page: Page, vp: string, screen: string, n: number): Promise<void> {
  const out = await page.evaluate(() => {
    const issues: string[] = [];
    const vw = window.innerWidth, vh = window.innerHeight;
    const de = document.documentElement;
    if (de.scrollWidth > vw + 1) issues.push(`page scrolls sideways (${de.scrollWidth} > ${vw})`);
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const label = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}“${(el.textContent ?? "").trim().slice(0, 28)}”`;
    // Panel body: can everything be reached? (centre-justified overflow clips the top, which no scrollbar can reach)
    const body = document.querySelector(".panel-body");
    if (body) {
      const br = body.getBoundingClientRect();
      const first = body.firstElementChild?.getBoundingClientRect();
      if (first && first.top < br.top - 1) issues.push(`panel content clipped at the TOP by ${Math.round(br.top - first.top)}px (unreachable)`);
      if (body.scrollWidth > body.clientWidth + 1) issues.push(`panel body overflows sideways (${body.scrollWidth} > ${body.clientWidth})`);
      for (const el of body.querySelectorAll("*")) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > br.right + 1 || r.left < br.left - 1) { issues.push(`${label(el)} sticks out of the panel sideways`); break; }
      }
    }
    // Footer controls must be on screen (page scrolls on small screens, so check against the document on those)
    for (const b of document.querySelectorAll(".panel-foot button, .panel-head button")) {
      const r = b.getBoundingClientRect();
      const small = window.matchMedia("(max-width:820px)").matches;
      if (!small && (r.bottom > vh + 1 || r.top < -1)) issues.push(`${label(b)} is off-screen`);
      if (r.right > vw + 1 || r.left < -1) issues.push(`${label(b)} is cut off sideways`);
    }
    // Touch targets
    for (const b of document.querySelectorAll("button, a.bigbtn, .check, input[type=checkbox]")) {
      if (!visible(b)) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) issues.push(`tiny target ${Math.round(r.width)}x${Math.round(r.height)}: ${label(b)}`);
    }
    // Text overlapping its neighbours inside the HUD
    const hud = document.querySelector(".hud");
    if (hud) {
      const kids = [...hud.children].filter(visible).map((k) => ({ k, r: k.getBoundingClientRect() }));
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i]!.r, c = kids[j]!.r;
        if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) issues.push(`HUD overlap: ${label(kids[i]!.k)} / ${label(kids[j]!.k)}`);
      }
    }
    // Panel taller than viewport on desktop layout?
    const panel = document.querySelector(".panel");
    if (panel && !window.matchMedia("(max-width:820px)").matches) {
      const pr = panel.getBoundingClientRect();
      if (pr.bottom > vh + 1 || pr.top < -1) issues.push(`panel exceeds viewport (${Math.round(pr.top)}..${Math.round(pr.bottom)} of ${vh})`);
    }
    return issues;
  });
  for (const problem of out) findings.push({ vp, screen, problem });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${vp}__${String(n).padStart(2, "0")}-${screen.replace(/\W+/g, "_")}.png`), fullPage: false });
}

test.afterAll(() => {
  const lines = findings.map((f) => `${f.vp} | ${f.screen} | ${f.problem}`);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, "findings.txt"), lines.join("\n"));
  expect(lines, `layout problems:\n${[...new Set(lines)].join("\n")}`).toEqual([]);
});

for (const vp of VIEWPORTS) {
  test(`layout holds up at ${vp.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    reset({
      notes,
      workItems: [
        { id: "w-long", title: LONG, summary: `${LONG} • ${longPoints.map((p) => p.text).join(" • ")}`, url: "https://example.org/a/very/long/path/that/goes/on/and/on/and/on/and/on/and/on/forever/and/ever", date: TODAY, source: "an-extremely-long-source-name.example.org", tag: "security", points: longPoints },
      ],
      warnings: { world: ["Feed https://example.org/feed.xml returned HTTP 503 twice and was skipped, so some stories may be missing"] },
    });
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    let n = 0;
    await expect(page.getByRole("button", { name: /TAP TO BEGIN/ })).toBeEnabled({ timeout: 10_000 }); // brief loaded (not LOADING/OFFLINE)
    await inspect(page, vp.name, "intro", n++);
    await page.getByRole("button", { name: /TAP TO BEGIN/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(500); // let the entrance animation settle
      const head = (await page.locator(".panel-head h2").innerText()).trim();
      const count = (await page.locator(".count").innerText()).trim();
      await inspect(page, vp.name, `${head} ${count}`, n++);
      if (await page.getByRole("button", { name: /^Finish/ }).count()) break;
      const nb = next(page);
      await nb.scrollIntoViewIfNeeded();
      await nb.click();
      if (await page.getByTestId("leave-popup").count()) {
        await inspect(page, vp.name, "leave popup", n++);
        await page.getByTestId("leave-keep").click();
      }
    }
    await next(page).click();
    await page.waitForTimeout(1200);
    await inspect(page, vp.name, "done orbit", n++);
  });
}
