"use client";

import { useEffect, useRef } from "react";

/**
 * Lightning over the forecast deck while it is really striking near the place (Xweather's live count).
 *
 *   count   strikes within 100 km in the last `windowMin` minutes: more strikes, more frequent flashes
 *           (one every ~9 s for a couple of strikes, about one a second for hundreds);
 *   cg, ic  Xweather's cloud-to-ground / in-cloud split: a cloud-to-ground strike is a branching bolt to the
 *           bottom of the panel, an in-cloud one a sheet of light flickering inside the "cloud" at the top.
 *
 * Each flash flickers two or three times over ~0.4 s and lights the whole panel faintly, as real ones do.
 * Respects prefers-reduced-motion.
 */
export function LightningOverlay({ count, cg, ic, className = "" }: { count: number; cg: number; ic: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const data = useRef({ count, cg, ic });
  data.current = { count, cg, ic };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0;

    type Seg = [number, number, number, number, number]; // x1 y1 x2 y2 width
    type Flash = { kind: "cg" | "ic"; segs: Seg[]; x: number; y: number; r: number; start: number; pulses: number[] };
    let flashes: Flash[] = [];
    let next = performance.now() + 600 + Math.random() * 1500;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    /** A jagged channel from (x, y) downward, with forks that die out. */
    const bolt = (x: number, y: number, toY: number, width: number, depth: number, out: Seg[]) => {
      let cx = x, cy = y;
      while (cy < toY) {
        const step = 8 + Math.random() * 18;
        const nx = cx + (Math.random() - 0.5) * step * 1.4;
        const ny = cy + step;
        out.push([cx, cy, nx, ny, width]);
        if (depth < 3 && Math.random() < 0.12) bolt(nx, ny, ny + (toY - ny) * (0.2 + Math.random() * 0.4), width * 0.55, depth + 1, out);
        cx = nx;
        cy = ny;
      }
    };

    const spawn = (t: number) => {
      const { cg: g, ic: i } = data.current;
      const cgShare = g + i > 0 ? g / (g + i) : 0.4;
      const kind = Math.random() < Math.max(0.25, cgShare) ? "cg" : "ic";
      const x = w * (0.08 + Math.random() * 0.84);
      const segs: Seg[] = [];
      if (kind === "cg") bolt(x, -4, h * (0.75 + Math.random() * 0.25), 2.2, 0, segs);
      // Flicker: 2–3 return strokes a few tens of ms apart.
      const pulses = [0, 70 + Math.random() * 60, ...(Math.random() < 0.6 ? [190 + Math.random() * 120] : [])];
      flashes.push({ kind, segs, x, y: h * (0.05 + Math.random() * 0.2), r: Math.max(w, h) * (0.25 + Math.random() * 0.2), start: t, pulses });
    };

    /** Brightness of a flash at age `a` ms: sharp peaks at each pulse, decaying. */
    const glow = (f: Flash, a: number) => f.pulses.reduce((m, p) => (a >= p ? Math.max(m, Math.exp(-(a - p) / 55)) : m), 0);

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const n = Math.max(1, data.current.count);
      if (t >= next) {
        spawn(t);
        const mean = Math.min(9000, Math.max(700, 14000 / Math.sqrt(n)));
        next = t + mean * (0.5 + Math.random());
      }
      ctx.clearRect(0, 0, w, h);
      flashes = flashes.filter((f) => t - f.start < 700);
      for (const f of flashes) {
        const k = glow(f, t - f.start);
        if (k < 0.01) continue;
        // the whole panel lights up a little
        ctx.fillStyle = `rgba(200, 210, 255, ${0.07 * k})`;
        ctx.fillRect(0, 0, w, h);
        // the cloud lights up around the channel's root
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, `rgba(215, 222, 255, ${(f.kind === "ic" ? 0.32 : 0.22) * k})`);
        g.addColorStop(1, "rgba(215, 222, 255, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        if (f.kind === "cg") {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          for (const pass of [
            { blur: 18, color: `rgba(170, 160, 255, ${0.55 * k})`, mul: 3 },
            { blur: 0, color: `rgba(255, 255, 255, ${0.95 * k})`, mul: 1 },
          ]) {
            ctx.shadowBlur = pass.blur;
            ctx.shadowColor = "rgba(180, 170, 255, 0.9)";
            ctx.strokeStyle = pass.color;
            for (const [x1, y1, x2, y2, wd] of f.segs) {
              ctx.lineWidth = wd * pass.mul;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            }
          }
          ctx.shadowBlur = 0;
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      flashes = [];
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
