"use client";

import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor, Stars } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { useAppStore } from "@/store/useAppStore";
import { Earth } from "./Earth";
import { Atmosphere } from "./Atmosphere";
import { CloudLayer } from "./CloudLayer";
import { PrecipitationLayer } from "./PrecipitationLayer";
import { SnowfallLayer } from "./SnowfallLayer";
import { LightningLayer } from "./LightningLayer";
import { StormLayer } from "./StormLayer";
import { TemperatureLayer } from "./TemperatureLayer";
import { WindLayer } from "./WindLayer";
import { LocationMarker } from "./LocationMarker";
import { Graticule } from "./Graticule";
import { Sun } from "./Sun";
import { CameraRig, HOME_DIST } from "./CameraRig";
import { TimeDriver } from "./TimeDriver";

export default function GlobeCanvas({
  sidebarOffset,
  bottomOffset,
  topOffset,
}: {
  sidebarOffset: number;
  bottomOffset: number;
  topOffset: number;
}) {
  const layers = useAppStore((s) => s.layers);
  const [dpr, setDpr] = useState(1.5);
  // Bloom is the first thing to go on weak GPUs.
  const [fx, setFx] = useState(true);

  return (
    <Canvas
      camera={{ fov: 35, near: 0.01, far: 400, position: [0, 0, HOME_DIST] }}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color("#010204"));
        // The Earth shader tone-maps itself; overlays are authored display-ready.
        gl.toneMapping = THREE.NoToneMapping;
      }}
    >
      <PerformanceMonitor
        bounds={() => [48, 60]}
        flipflops={3}
        onIncline={() => setDpr((d) => Math.min(2, d + 0.25))}
        onDecline={() => setDpr((d) => Math.max(0.75, d - 0.25))}
        onFallback={() => setFx(false)}
      />
      <AdaptiveDpr pixelated={false} />
      <TimeDriver />
      <Stars radius={150} depth={80} count={9000} factor={3.4} saturation={0.15} fade speed={0.2} />
      <Sun />
      <Suspense fallback={null}>
        <Earth cloudShadow={layers.clouds ? 1 : 0} snow={layers.snow} />
        <TemperatureLayer enabled={layers.temperature} />
        <PrecipitationLayer enabled={layers.rain} />
        <SnowfallLayer enabled={layers.snow} />
        <CloudLayer enabled={layers.clouds} />
        <Graticule />
        <WindLayer enabled={layers.wind} />
        <StormLayer enabled={layers.storms} />
        <LightningLayer enabled={layers.lightning} />
        <LocationMarker />
        <Atmosphere />
      </Suspense>
      <CameraRig sidebarOffset={sidebarOffset} bottomOffset={bottomOffset} topOffset={topOffset} />
      {fx && (
        <EffectComposer multisampling={dpr > 1.25 ? 0 : 4} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.62} luminanceSmoothing={0.25} radius={0.72} />
          <Vignette offset={0.28} darkness={0.6} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
