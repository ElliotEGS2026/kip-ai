import { useEffect, useRef, useState } from "react";

/** Things the Kips bounce off. Everything else is simply drawn on top of them (they live on the background layer). */
const OBSTACLES = ".hud .brand, .pips, .hud-right, .center .core, .orb, .panel, .banner, .hint, .again";
const MIN_SPEED = 28, MAX_SPEED = 85, FLEE_SPEED = 170; // px per second
const BIG = { min: 8, max: 12, size: [74, 112] as const }; // how many big Kips, and their size range (px)
const TOTAL_MAX = 15; // big + little together
const LITTLE = { size: [34, 52] as const };

interface Spec { size: number; little: boolean }
interface Kip { el: HTMLImageElement; size: number; r: number; m: number; fleeing: boolean; wasFleeing: boolean; x: number; y: number; vx: number; vy: number }
interface Box { left: number; right: number; top: number; bottom: number }
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const between = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
const intBetween = (lo: number, hi: number): number => lo + Math.floor(Math.random() * (hi - lo + 1));

/** One random crowd: 8-12 big Kips, then a second random roll adds 0 to (15 - big) little ones. */
export function rollCrowd(): Spec[] {
  const big = intBetween(BIG.min, BIG.max);
  const little = intBetween(0, TOTAL_MAX - big);
  return [
    ...Array.from({ length: big }, () => ({ size: Math.round(between(...BIG.size)), little: false })),
    ...Array.from({ length: little }, () => ({ size: Math.round(between(...LITTLE.size)), little: true })),
  ];
}

/** Circle against a rectangle: ease the Kip out of it and reflect its velocity. Never teleports. */
function bounceRect(k: Kip, rc: Box, w: number, h: number): void {
  const cx = clamp(k.x, rc.left, rc.right), cy = clamp(k.y, rc.top, rc.bottom);
  const dx = k.x - cx, dy = k.y - cy, d = Math.hypot(dx, dy);
  if (d >= k.r) return;
  let nx: number, ny: number;
  if (d > 0) {
    nx = dx / d; ny = dy / d;
    const push = Math.min(k.r - d, 4);
    k.x += nx * push; k.y += ny * push;
  } else {
    // Centre is inside the box (e.g. a panel just opened over it): drift out through the nearest side.
    // Only sides with room for a whole Kip to fit between the box and the screen edge count as exits.
    const exits: [number, number, number][] = [
      [k.x - rc.left, -1, 0], [rc.right - k.x, 1, 0], [k.y - rc.top, 0, -1], [rc.bottom - k.y, 0, 1],
    ];
    const room = [rc.left >= 2 * k.r, w - rc.right >= 2 * k.r, rc.top >= 2 * k.r, h - rc.bottom >= 2 * k.r];
    const open = exits.filter((_, i) => room[i]);
    if (open.length === 0) return; // nowhere to go: he stays behind the box
    [, nx, ny] = open.reduce((a, b) => (b[0] < a[0] ? b : a));
    k.fleeing = true; // hurry out: allowed to move faster than usual until clear
    k.vx = nx * FLEE_SPEED; k.vy = ny * FLEE_SPEED;
    return;
  }
  const vn = k.vx * nx + k.vy * ny;
  if (vn < 0) { k.vx -= 2 * vn * nx; k.vy -= 2 * vn * ny; }
}

/** Two Kips: separate them and bounce them off each other (heavier Kips push lighter ones around). */
function bouncePair(a: Kip, b: Kip): void {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
  if (d >= min || d === 0 || a.wasFleeing || b.wasFleeing) return; // a Kip hurrying out from behind a panel ignores the crowd
  const nx = dx / d, ny = dy / d, push = Math.min(min - d, 4), wa = b.m / (a.m + b.m), wb = a.m / (a.m + b.m); // the lighter Kip gives way more
  a.x -= nx * push * wa; a.y -= ny * push * wa; b.x += nx * push * wb; b.y += ny * push * wb;
  const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
  if (va - vb > 0) { // only if they are approaching
    const j = (2 * (va - vb)) / (a.m + b.m);
    a.vx -= j * b.m * nx; a.vy -= j * b.m * ny;
    b.vx += j * a.m * nx; b.vy += j * a.m * ny;
  }
}

/**
 * Kip the plush, floating around the background on every screen: a random crowd of 8-15 (see rollCrowd).
 * They sit behind the interface (so they can never cover anything) and bounce off the screen edges,
 * the interface's boxes, and each other. They hold still if the user prefers reduced motion.
 */
export function Kips() {
  const layer = useRef<HTMLDivElement>(null);
  const [crowd] = useState(rollCrowd);
  useEffect(() => {
    const root = layer.current;
    if (!root) return;
    let w = window.innerWidth, h = window.innerHeight;
    const boxesNow = (): Box[] => [...document.querySelectorAll(OBSTACLES)].map((e) => ({ e, b: e.getBoundingClientRect() })).filter(({ b }) => b.width > 0 && b.height > 0)
      // A panel is treated as a full-height column: Kips live beside it, not in the thin strips above and below it.
      .map(({ e, b }) => (e.classList.contains("panel") ? { left: b.left, right: b.right, top: 0, bottom: h } : { left: b.left, right: b.right, top: b.top, bottom: b.bottom }));

    // Start each Kip somewhere free (a few random tries), moving in a random direction.
    const start = boxesNow();
    const kips: Kip[] = [];
    [...root.querySelectorAll("img")].forEach((el, i) => {
      const size = crowd[i]!.size, r = size * 0.42, angle = Math.random() * Math.PI * 2, speed = between(MIN_SPEED, MAX_SPEED * 0.7);
      let x = 0, y = 0;
      for (let tries = 0; tries < 60; tries++) {
        x = between(r, w - r); y = between(r, h - r);
        const free = start.every((b) => Math.hypot(x - clamp(x, b.left, b.right), y - clamp(y, b.top, b.bottom)) > r) && kips.every((o) => Math.hypot(x - o.x, y - o.y) > r + o.r);
        if (free) break;
      }
      kips.push({ el, size, r, m: r * r, fleeing: false, wasFleeing: false, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
    });

    const step = (dt: number, t: number) => {
      const boxes = boxesNow();
      kips.forEach((k) => { k.x += k.vx * dt; k.y += k.vy * dt; k.wasFleeing = k.fleeing; k.fleeing = false; });
      for (let i = 0; i < kips.length; i++) for (let j = i + 1; j < kips.length; j++) bouncePair(kips[i]!, kips[j]!);
      for (const k of kips) for (const b of boxes) bounceRect(k, b, w, h); // boxes last: a Kip is never squeezed into the interface
      kips.forEach((k, i) => {
        // The screen edges win over everything, so a Kip squeezed beside a wide panel just slips behind it.
        if (k.x < k.r) { k.x = k.r; k.vx = Math.abs(k.vx); } else if (k.x > w - k.r) { k.x = w - k.r; k.vx = -Math.abs(k.vx); }
        if (k.y < k.r) { k.y = k.r; k.vy = Math.abs(k.vy); } else if (k.y > h - k.r) { k.y = h - k.r; k.vy = -Math.abs(k.vy); }
        const sp = Math.hypot(k.vx, k.vy) || 1, to = clamp(sp, MIN_SPEED, k.fleeing ? FLEE_SPEED : MAX_SPEED);
        k.vx *= to / sp; k.vy *= to / sp;
        k.el.style.transform = `translate(${k.x - k.size / 2}px, ${k.y - k.size / 2}px) rotate(${Math.sin(t / 900 + i * 2) * 7}deg)`;
      });
    };
    const onResize = () => { w = window.innerWidth; h = window.innerHeight; };
    window.addEventListener("resize", onResize);
    let raf = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 60; i++) step(0.05, 0); // settle out of the way, then stay put
    } else {
      let last = performance.now();
      const tick = (now: number) => { step(Math.min(0.05, (now - last) / 1000), now); last = now; raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [crowd]);

  return (
    <div className="kips" ref={layer} aria-hidden="true">
      {crowd.map((c, i) => <img key={i} className="kip" data-testid="kip" data-kind={c.little ? "little" : "big"} data-r={c.size * 0.42} src="/kip.png" alt="" draggable={false} style={{ width: c.size, height: c.size }} />)}
    </div>
  );
}
