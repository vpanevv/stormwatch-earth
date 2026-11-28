"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Wraps a globe layer so that turning it on or off never costs a hitch or a wasted draw:
 *  - its shaders are compiled with renderer.compileAsync (KHR_parallel_shader_compile where available) while the
 *    layer stays hidden, instead of synchronously on its first visible frame (which froze the page for up to 1 s);
 *  - it is only drawn while its fade is above zero, so a layer that has been switched off costs nothing.
 */
export function LayerGroup({ opacity, children }: { opacity: RefObject<number>; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const ready = useRef(false);
  const { gl, camera, scene } = useThree();

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    let alive = true;
    // Visible stand-ins sharing each geometry and material: compileAsync only walks visible objects.
    const probes: THREE.Object3D[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.material || !m.geometry) return;
      const geo = m.geometry;
      const mat = m.material as THREE.Material;
      probes.push(
        (o as THREE.Points).isPoints
          ? new THREE.Points(geo, mat)
          : (o as THREE.LineSegments).isLineSegments
            ? new THREE.LineSegments(geo, mat)
            : (o as THREE.Line).isLine
              ? new THREE.Line(geo, mat)
              : new THREE.Mesh(geo, mat),
      );
    });
    const root = new THREE.Group();
    for (const p of probes) root.add(p);
    gl.compileAsync(root, camera, scene)
      .catch(() => undefined)
      .then(() => {
        if (alive) ready.current = true;
      });
    return () => {
      alive = false;
    };
  }, [gl, camera, scene]);

  useFrame(() => {
    const g = group.current;
    if (g) g.visible = ready.current && (opacity.current ?? 0) > 0.002;
  });

  return (
    <group ref={group} visible={false}>
      {children}
    </group>
  );
}
