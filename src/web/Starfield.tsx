import { useEffect, useRef } from "react";

interface P { x: number; y: number; r: number; vx: number; vy: number; a: number }

/** Animated red particle field + faint grid. Static when the user prefers reduced motion. */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0;
    let pts: P[] = [];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 14000);
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.8 + 0.4,
        vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15, a: Math.random() * 0.6 + 0.2,
      }));
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(229,38,43,0.05)";
      ctx.lineWidth = 1;
      const g = 48, off = still ? 0 : (t / 80) % g;
      ctx.beginPath();
      for (let x = -off; x < w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = -off; y < h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      for (const p of pts) {
        if (!still) {
          p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
        }
        const tw = still ? 1 : 0.6 + 0.4 * Math.sin(t / 700 + p.x);
        ctx.fillStyle = `rgba(255,${90 + Math.round(p.a * 60)},${95},${p.a * tw})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
