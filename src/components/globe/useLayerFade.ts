"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * Lazy-mount + smooth fade for a globe layer.
 * The layer is only mounted (and its data fetched) the first time it's enabled,
 * then fades in/out instead of popping.
 */
export function useLayerFade(enabled: boolean, seconds = 0.6) {
  const [mounted, setMounted] = useState(enabled);
  const opacity = useRef(0);
  useEffect(() => {
    if (enabled) setMounted(true);
  }, [enabled]);
  useFrame((_, dt) => {
    const target = enabled ? 1 : 0;
    const step = Math.min(dt, 0.1) / seconds;
    opacity.current = target > opacity.current ? Math.min(1, opacity.current + step) : Math.max(0, opacity.current - step);
  });
  return { mounted, opacity };
}
