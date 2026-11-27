"use client";

import { useEffect, useRef } from "react";

/**
 * Falling rain streaks on a 2D canvas, sized to its parent. `intensity` 0..1 scales both how many
 * drops fall and how fast they fall; respects prefers-reduced-motion.
 */
export function RainOverlay({ intensity, className = "" }: { intensity: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const level = useRef(intensity);
  level.current = intensity;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    type Drop = { x: number; y: number; len: number; v: number; a: number };
    let drops: Drop[] = [];
    let w = 0, h = 0, raf = 0, last = performance.now();
    const SLANT = 0.14; // wind lean: px sideways per px down

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const spawn = (anywhere: boolean): Drop => ({
      x: Math.random() * (w + h * SLANT) - h * SLANT,
      y: anywhere ? Math.random() * h : -20 - Math.random() * 40,
      len: 7 + Math.random() * 10,
      v: 0.75 + Math.random() * 0.5,
      a: 0.18 + Math.random() * 0.3,
    });
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const k = level.current;
      // Light rain: a sparse drizzle; a downpour: dense and fast.
      const target = Math.round((0.08 + k * 0.92) * (w * h) / 1500);
      while (drops.length < target) drops.push(spawn(drops.length < target / 2));
      if (drops.length > target) drops.length = target;
      const speed = 380 + k * 820; // px/s

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineWidth = 1;
      for (const d of drops) {
        const dy = speed * d.v * dt;
        d.y += dy;
        d.x += dy * SLANT;
        if (d.y - d.len > h) Object.assign(d, spawn(false));
        const len = d.len * (0.7 + k * 0.6);
        ctx.strokeStyle = `rgba(168, 204, 255, ${d.a})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - len * SLANT, d.y - len);
        ctx.stroke();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      drops = [];
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
