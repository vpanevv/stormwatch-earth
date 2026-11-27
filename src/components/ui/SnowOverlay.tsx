"use client";

import { useEffect, useRef } from "react";

/**
 * Falling-snow particles on a 2D canvas, sized to its parent. `intensity` 0..1 scales
 * flake count and speed; respects prefers-reduced-motion.
 */
export function SnowOverlay({ intensity, className = "" }: { intensity: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const level = useRef(intensity);
  level.current = intensity;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    type Flake = { x: number; y: number; r: number; vy: number; phase: number };
    let flakes: Flake[] = [];
    let w = 0, h = 0, raf = 0, last = performance.now();

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const spawn = (anywhere: boolean): Flake => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -6,
      r: 0.6 + Math.random() * 1.8,
      vy: 12 + Math.random() * 28,
      phase: Math.random() * Math.PI * 2,
    });
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const target = Math.round(level.current * (w * h) / 900);
      while (flakes.length < target) flakes.push(spawn(flakes.length < target / 2));
      if (flakes.length > target) flakes.length = target;
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.vy * (0.6 + level.current) * dt;
        f.x += Math.sin(t / 900 + f.phase) * 12 * dt;
        if (f.y > h + 6) Object.assign(f, spawn(false));
        ctx.globalAlpha = 0.35 + f.r / 4;
        ctx.fillStyle = "#eef4ff";
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      flakes = [];
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
