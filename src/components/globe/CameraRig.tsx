"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useAppStore } from "@/store/useAppStore";
import { EARTH_RADIUS_KM, latLonToVec3, vec3ToLatLon } from "@/lib/geo";
import { selectCoordinates } from "@/lib/actions";

const MIN_DIST = 1.2;
const MAX_DIST = 10;
export const HOME_DIST = 3.7;
const HALF_FOV_TAN = Math.tan((35 / 2) * (Math.PI / 180));

/** Distance at which the globe fills ~86% of the free area (viewport minus sidebar and forecast deck). */
/** Pin gestures (Watched, src/globe/pin.ts): a mouse press that moves further than this is a drag… */
const PIN_CLICK_SLOP_PX = 5;
/** …or one held longer than this is a grab, not a click. */
const PIN_CLICK_MAX_MS = 600;
/** A finger held still this long drops a pin, "still" meaning within PIN_HOLD_SLOP_PX. */
const PIN_HOLD_MS = 450;
const PIN_HOLD_SLOP_PX = 9;

export function homeDistance(width: number, height: number, sidebarOffset: number, bottomOffset = 0, topOffset = 0) {
  const free = Math.min(Math.max(200, height - bottomOffset - topOffset), Math.max(320, width - sidebarOffset));
  const radiusPx = 0.43 * free;
  return THREE.MathUtils.clamp(height / 2 / (HALF_FOV_TAN * radiusPx), 3.2, 8.5);
}
const IDLE_MS = 7000;

type Flight = {
  from: THREE.Vector3;
  q: THREE.Quaternion;
  fromDist: number;
  toDist: number;
  arc: number;
  start: number;
  duration: number;
};

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const IDENTITY = new THREE.Quaternion();

/**
 * Orbit controls with inertia, great-circle fly-to, idle auto-rotation,
 * pointer → lat/lon picking (analytic ray–sphere, no mesh raycasting) and double-click to focus.
 */
export function CameraRig({
  sidebarOffset,
  bottomOffset,
  topOffset,
}: {
  sidebarOffset: number;
  bottomOffset: number;
  topOffset: number;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, gl, size } = useThree();
  const flight = useRef<Flight | null>(null);
  const lastInteraction = useRef(performance.now());
  const lastAlt = useRef(0);
  const fly = useAppStore((s) => s.fly);
  const entered = useAppStore((s) => s.entered);
  const home = () => homeDistance(size.width, size.height, sidebarOffset, bottomOffset, topOffset);

  // Shift the projection so the globe centres in the space left of the sidebar and above the deck.
  // Before entering, the globe sits centred behind the intro screen.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    // Pre-entry on wide screens the planet sits right of the intro copy.
    // Landing: the planet sits right of the hero column on wide screens, above the panel on phones.
    const wide = size.width >= 1024;
    const ox = entered ? sidebarOffset / 2 : wide ? -size.width * 0.21 : 0;
    const oy = entered ? (bottomOffset - topOffset) / 2 : wide ? 0 : size.height * 0.28;
    if (ox || oy) cam.setViewOffset(size.width, size.height, ox, oy, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, sidebarOffset, bottomOffset, topOffset, entered]);

  // Diameter ≈ 72% of the height on wide screens, ≈ 86% of the width on phones.
  const landingDistance = () => {
    const wide = size.width >= 1024;
    const radiusPx = wide ? Math.min(0.34 * size.height, 0.2 * size.width) : 0.34 * size.width;
    return THREE.MathUtils.clamp(size.height / 2 / (HALF_FOV_TAN * radiusPx), 3.6, MAX_DIST);
  };

  // Before entry the planet turns slowly in deep space, behind the intro screen.
  useEffect(() => {
    const lon = THREE.MathUtils.clamp((-new Date().getTimezoneOffset() / 60) * 15, -180, 180);
    const dir = latLonToVec3(18, lon - 25).normalize();
    camera.position.copy(dir.multiplyScalar(landingDistance()));
    camera.lookAt(0, 0, 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back to the intro screen (the wordmark): pull out to the landing framing over the same spot.
  const wasEntered = useRef(entered);
  useEffect(() => {
    if (wasEntered.current && !entered) {
      const dir = camera.position.clone().normalize();
      const to = dir.clone().setY(THREE.MathUtils.clamp(dir.y, -0.5, 0.5)).normalize();
      startFlight(to, landingDistance(), 1.6, dir.angleTo(to));
    }
    wasEntered.current = entered;
  }, [entered]); // eslint-disable-line react-hooks/exhaustive-deps

  // On entry: dive in toward the remembered place, or the viewer's longitude.
  useEffect(() => {
    if (!entered) return;
    const sel = useAppStore.getState().selection;
    const lon = THREE.MathUtils.clamp((-new Date().getTimezoneOffset() / 60) * 15, -180, 180);
    const to = latLonToVec3(sel ? THREE.MathUtils.clamp(sel.lat, -70, 70) : 28, sel ? sel.lon : lon).normalize();
    const angle = camera.position.clone().normalize().angleTo(to);
    startFlight(to, sel ? Math.min(home(), 2.4) : home(), 3.2, angle * 0.4);
  }, [entered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fly) return;
    const lat = THREE.MathUtils.clamp(fly.lat, -80, 80);
    const to = latLonToVec3(lat, fly.lon).normalize();
    const fromDist = camera.position.length();
    if (!useAppStore.getState().entered) return;
    const toDist = fly.distance ?? Math.min(fromDist, home());
    const angle = camera.position.clone().normalize().angleTo(to);
    startFlight(to, toDist, THREE.MathUtils.clamp(1.1 + angle * 0.8, 1.1, 3), angle);
  }, [fly]); // eslint-disable-line react-hooks/exhaustive-deps

  function startFlight(to: THREE.Vector3, toDist: number, duration: number, angle: number) {
    const from = camera.position.clone().normalize();
    const fromDist = camera.position.length();
    flight.current = {
      from,
      q: new THREE.Quaternion().setFromUnitVectors(from, to),
      fromDist,
      toDist: THREE.MathUtils.clamp(toDist, MIN_DIST, MAX_DIST),
      arc: Math.min(1.2, angle * 0.45),
      start: performance.now(),
      duration: duration * 1000,
    };
    lastInteraction.current = performance.now();
  }

  // Picking: hover read-out + double-click focus.
  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    let raf = 0;
    const pick = (e: PointerEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectSphere(sphere, hit) ? vec3ToLatLon(hit) : null;
    };
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = pick(e);
        useAppStore.getState().setHover(p);
        el.style.cursor = p ? "crosshair" : "";
      });
    };
    const onLeave = () => useAppStore.getState().setHover(null);
    // Clicks on the planet (Watched's pin gestures): a mouse click that isn't a drag — or a finger held still for
    // HOLD_MS — drops a pin whose card names the nearest town; a click on space clears it. On the intro screen a
    // click picks the spot outright and enters.
    let down: { x: number; y: number; at: number; mouse: boolean; ok: boolean } | null = null;
    let hold = 0;
    const onDown = (e: PointerEvent) => {
      clearTimeout(hold);
      const mouse = e.pointerType === "mouse";
      down = { x: e.clientX, y: e.clientY, at: performance.now(), mouse, ok: e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey };
      const st = useAppStore.getState();
      if (!mouse && st.entered && e.isPrimary) {
        const start = down;
        hold = window.setTimeout(() => {
          if (down !== start) return;
          const p = pick(e);
          if (p) useAppStore.getState().dropPin(p);
          down = null; // the finger's release is not also a click
        }, PIN_HOLD_MS);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (down && !down.mouse && Math.hypot(e.clientX - down.x, e.clientY - down.y) > PIN_HOLD_SLOP_PX) {
        clearTimeout(hold);
        down = null;
      }
    };
    const onUp = (e: PointerEvent) => {
      clearTimeout(hold);
      const d = down;
      down = null;
      if (!d || !d.ok || Math.hypot(e.clientX - d.x, e.clientY - d.y) > PIN_CLICK_SLOP_PX || performance.now() - d.at > PIN_CLICK_MAX_MS) return;
      const st = useAppStore.getState();
      if (!st.globeReady) return;
      const p = pick(e);
      if (!st.entered) {
        if (!p) return;
        selectCoordinates(p);
        st.enter();
        return;
      }
      if (!d.mouse) return; // touch drops pins by holding; a quick tap does nothing
      if (p) st.dropPin(p);
      else st.clearPin();
    };
    const onCancel = () => {
      clearTimeout(hold);
      down = null;
    };
    const onDbl = (e: MouseEvent) => {
      const p = pick(e);
      if (!p) return;
      const d = camera.position.length();
      selectCoordinates(p, { distance: Math.max(MIN_DIST + 0.15, Math.min(d * 0.7, 2.2)) });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("dblclick", onDbl);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    return () => {
      clearTimeout(hold);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("dblclick", onDbl);
    };
  }, [gl, camera]);

  useFrame(() => {
    const c = controls.current;
    const f = flight.current;
    if (f && c) {
      const t = Math.min(1, (performance.now() - f.start) / f.duration);
      const e = easeInOutCubic(t);
      const q = IDENTITY.clone().slerp(f.q, e);
      const dir = f.from.clone().applyQuaternion(q);
      const dist = THREE.MathUtils.lerp(f.fromDist, f.toDist, e) + Math.sin(Math.PI * e) * f.arc;
      camera.position.copy(dir.multiplyScalar(dist));
      camera.lookAt(0, 0, 0);
      c.enabled = false;
      if (t >= 1) {
        flight.current = null;
        c.enabled = true;
      }
      c.update();
    }
    if (c) {
      const dist = camera.position.length();
      // Finer control when close to the surface.
      c.rotateSpeed = THREE.MathUtils.clamp(0.12 + (dist - 1) * 0.17, 0.12, 0.6);
      c.zoomSpeed = THREE.MathUtils.clamp(0.4 + (dist - 1) * 0.15, 0.4, 1.0);
      const s = useAppStore.getState();
      const idle = performance.now() - lastInteraction.current;
      c.autoRotate = !flight.current && (s.entered ? !s.selection && idle > IDLE_MS : idle > 2500);
      c.autoRotateSpeed = s.entered ? 0.35 : 0.6;
      // Landing: the planet can be turned but not zoomed (wheel scrolls nothing, the page is the hero).
      c.enabled = !flight.current;
      c.enableZoom = s.entered;
      const alt = (dist - 1) * EARTH_RADIUS_KM;
      if (Math.abs(alt - lastAlt.current) / Math.max(1, lastAlt.current) > 0.01) {
        lastAlt.current = alt;
        s.setAltitude(alt);
      }
    }
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableDamping
      dampingFactor={0.065}
      minDistance={MIN_DIST}
      maxDistance={MAX_DIST}
      onStart={() => {
        lastInteraction.current = performance.now();
        flight.current = null;
        if (controls.current) controls.current.enabled = true;
      }}
      onEnd={() => (lastInteraction.current = performance.now())}
      makeDefault
    />
  );
}
