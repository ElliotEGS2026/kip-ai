import { expect, test } from "@playwright/test";
import { MAIN, SPARE } from "../../playwright.config";
import { reset, TODAY } from "./helpers";

const origin = `http://127.0.0.1:${MAIN.port}`;
let token = "";

test.beforeEach(async ({ page }) => {
  reset();
  await page.goto("/");
  token = (await page.locator('meta[name="kip-token"]').getAttribute("content")) ?? "";
});

test("index.html carries a real per-run token", () => {
  expect(token).toMatch(/^[a-f0-9]{48}$/);
});

test("responses carry no-store and a strict CSP", async ({ request }) => {
  const r = await request.get("/");
  expect(r.headers()["cache-control"]).toBe("no-store");
  expect(r.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
});

test("GET /api requires the token", async ({ request }) => {
  expect((await request.get(`/api/brief/${TODAY}`)).status()).toBe(403);
  expect((await request.get(`/api/brief/${TODAY}`, { headers: { "x-kip-token": "wrong" } })).status()).toBe(403);
  const ok = await request.get(`/api/brief/${TODAY}`, { headers: { "x-kip-token": token } });
  expect(ok.status()).toBe(200);
  const b = await ok.json();
  expect(b.sections.map((s: { id: string }) => s.id)).toEqual(["chess", "notes", "meetings", "email", "work", "world", "today"]);
});

test("a foreign Host header is rejected (DNS-rebinding defence)", async ({ request }) => {
  const r = await request.get(`/api/brief/${TODAY}`, { headers: { "x-kip-token": token, host: "evil.example.com" } });
  expect(r.status()).toBe(403);
});

test("brief endpoint validates dates", async ({ request }) => {
  const h = { "x-kip-token": token };
  expect((await request.get("/api/brief/not-a-date", { headers: h })).status()).toBe(400);
  expect((await request.get("/api/brief/2000-01-01", { headers: h })).status()).toBe(404);
});

test("unsafe methods need matching Origin and JSON content type", async ({ request }) => {
  const h = { "x-kip-token": token };
  const data = JSON.stringify({ text: "x" });
  expect((await request.post("/api/notes", { headers: { ...h, "content-type": "application/json" }, data })).status()).toBe(403); // no Origin
  expect((await request.post("/api/notes", { headers: { ...h, origin: "http://evil.example.com", "content-type": "application/json" }, data })).status()).toBe(403);
  expect((await request.post("/api/notes", { headers: { ...h, origin, "content-type": "text/plain" }, data })).status()).toBe(415);
  expect((await request.post("/api/notes", { headers: { ...h, origin, "content-type": "application/json" }, data })).status()).toBe(200);
});

test("bad input is rejected with 400", async ({ request }) => {
  const h = { "x-kip-token": token, origin, "content-type": "application/json" };
  expect((await request.post("/api/notes", { headers: h, data: JSON.stringify({}) })).status()).toBe(400);
  expect((await request.post("/api/feedback", { headers: h, data: JSON.stringify({ kind: "sideways" }) })).status()).toBe(400);
  expect((await request.post("/api/puzzle-result", { headers: h, data: JSON.stringify({ solved: "yes" }) })).status()).toBe(400);
  expect((await request.post("/api/notes/state", { headers: h, data: JSON.stringify({ id: "../../etc" }) })).status()).toBe(400);
});

test("static serving cannot escape the web root", async ({ request }) => {
  for (const p of ["/..%2f..%2fpackage.json", "/%2e%2e/%2e%2e/package.json", "/..%5c..%5cpackage.json"]) {
    const r = await request.get(p);
    expect(await r.text()).not.toContain('"name": "kip-ai"');
  }
});

test("shutdown API is guarded", async ({ request }) => {
  expect((await request.post("/api/shutdown", { headers: { origin, "content-type": "application/json" }, data: "{}" })).status()).toBe(403); // no token
  expect((await request.get(`/api/brief/${TODAY}`, { headers: { "x-kip-token": token } })).status()).toBe(200); // still up
});

test("Shut down: cancelling the confirm keeps the server running", async ({ page }) => {
  page.once("dialog", (d) => { void d.dismiss(); });
  await page.getByRole("button", { name: "Shut down" }).click();
  await expect(page.getByText("Server stopped")).toHaveCount(0);
  expect((await page.request.get(`/api/brief/${TODAY}`, { headers: { "x-kip-token": token } })).status()).toBe(200);
});

test("Shut down: confirming stops the server (disposable instance)", async ({ page }) => {
  reset({}, SPARE.root);
  await page.goto(`http://127.0.0.1:${SPARE.port}/`);
  page.once("dialog", (d) => { void d.accept(); });
  await page.getByRole("button", { name: "Shut down" }).click();
  await expect(page.getByText("Server stopped.")).toBeVisible();
  await expect.poll(() => page.request.get(`http://127.0.0.1:${SPARE.port}/`).then(() => "up", () => "down"), { timeout: 10_000 }).toBe("down");
});
