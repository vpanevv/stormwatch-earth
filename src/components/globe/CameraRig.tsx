"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useAppStore } from "@/store/useAppStore";
import { EARTH_RADIUS_KM, latLonToVec3, vec3ToLatLon } from "@/lib/geo";
import { selectCoordinates } from "@/lib/actions";

const MIN_DIST = 1.2;
const MAX_DIST = 10;
/** The landing may stand further off, so a short phone screen still fits the whole planet between header and copy. */
const LANDING_MAX_DIST = 18;
const FOV = 35;
/** Inertia after a throw decays with this time constant (s); holding still before release stops it faster. */
const SPIN_TAU = 0.32;
const HOLD_TAU = 0.05;
/** Zoom eases toward its target with this time constant (s). */
const ZOOM_TAU = 0.12;
/** Auto-rotation, degrees of longitude per second, and how long it takes to ramp in after the last input. */
const DRIFT_LANDING = 2.4;
const DRIFT_APP = 1.2;
const DRIFT_RAMP_S = 2.5;
/** The camera's latitude is kept off the poles (north-up view). */
const MAX_LAT = 82;
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
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const DEG = Math.PI / 180;

/** User input accumulated between frames (Watched's controls.ts pattern): the frame loop consumes it. */
type Input = { panX: number; panY: number; zoom: number; dragging: boolean; lastInputAt: number };
/** Camera pose in north-up spherical terms: latitude/longitude under the camera (rad) and altitude above the surface. */
type Pose = { lat: number; lon: number; alt: number };

function poseFromCamera(cam: THREE.Camera, out: Pose): Pose {
  const d = cam.position.length();
  const ll = vec3ToLatLon(_v.copy(cam.position).divideScalar(d));
  out.lat = ll.lat * DEG;
  out.lon = ll.lon * DEG;
  out.alt = d - 1;
  return out;
}

function applyPose(cam: THREE.Camera, p: Pose) {
  latLonToVec3(p.lat / DEG, p.lon / DEG, 1 + p.alt, cam.position);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
}

/**
 * The globe's camera, modelled on Watched's direct-manipulation controls (src/globe/controls.ts):
 *   drag            the surface follows the pointer at any zoom (radians per pixel from the altitude), with inertia
 *   wheel / pinch   zoom in log altitude, eased (τ 0.12 s), wheel deltas normalised across mice and trackpads
 *   flights         great-circle fly-to with distance interpolated in log space and a lift over long hops
 *   idle            slow westward drift that ramps in after the last input
 * plus pointer → lat/lon picking (analytic ray–sphere) for the hover read-out, pins and double-click focus.
 * No React state changes per frame: altitude and hover reach the store a few times a second at most.
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
  const { camera, gl, size } = useThree();
  const input = useRef<Input>({ panX: 0, panY: 0, zoom: 0, dragging: false, lastInputAt: 0 });
  const pose = useRef<Pose>({ lat: 0, lon: 0, alt: 2 });
  const spin = useRef({ lat: 0, lon: 0 });
  const zoomTarget = useRef<number | null>(null);
  const lastPublish = useRef(0);
  const flight = useRef<Flight | null>(null);
  const lastInteraction = useRef(performance.now());
  const lastAlt = useRef(0);
  const fly = useAppStore((s) => s.fly);
  const entered = useAppStore((s) => s.entered);
  const band = useAppStore((s) => s.landingBand);
  const home = () => homeDistance(size.width, size.height, sidebarOffset, bottomOffset, topOffset);

  // Shift the projection so the globe centres in the space left of the sidebar and above the deck.
  // Before entering, the globe sits centred behind the intro screen.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    // Pre-entry on wide screens the planet sits right of the intro copy.
    // Landing: the planet sits right of the hero column on wide screens; on phones, whole, in the clear band
    // between the header and the hero copy.
    const wide = size.width >= 1024;
    const ox = entered ? sidebarOffset / 2 : wide ? -size.width * 0.21 : 0;
    const oy = entered
      ? (bottomOffset - topOffset) / 2
      : wide
        ? 0
        : band
          ? size.height / 2 - (band.top + band.bottom) / 2
          : size.height * 0.28;
    if (ox || oy) cam.setViewOffset(size.width, size.height, ox, oy, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, sidebarOffset, bottomOffset, topOffset, entered, band]);

  // Diameter ≈ 72% of the height on wide screens; on phones as big as fits whole in the clear band (≤ 80% of
  // the width), with a little air above and below.
  const landingDistance = () => {
    const wide = size.width >= 1024;
    const radiusPx = wide
      ? Math.min(0.34 * size.height, 0.2 * size.width)
      : band
        ? Math.max(60, Math.min(0.4 * size.width, 0.42 * (band.bottom - band.top)))
        : 0.34 * size.width;
    // A near sphere's silhouette is a little wider than this pinhole estimate; the + 0.15 pulls back to cover it.
    return THREE.MathUtils.clamp(size.height / 2 / (HALF_FOV_TAN * radiusPx) + 0.15, 3.6, LANDING_MAX_DIST);
  };

  // While on the landing, a new band (the copy reflowed, the phone rotated) eases the planet to its new size.
  useEffect(() => {
    if (entered || flight.current) return;
    zoomTarget.current = Math.log(landingDistance() - 1);
  }, [band, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Before entry the planet turns slowly in deep space, behind the intro screen.
  useEffect(() => {
    const lon = THREE.MathUtils.clamp((-new Date().getTimezoneOffset() / 60) * 15, -180, 180);
    const dir = latLonToVec3(18, lon - 25).normalize();
    camera.position.copy(dir.multiplyScalar(landingDistance()));
    camera.lookAt(0, 0, 0);
    poseFromCamera(camera, pose.current);
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
      toDist: THREE.MathUtils.clamp(toDist, MIN_DIST, LANDING_MAX_DIST),
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
    // Hover read-out: picked at most ~12 times a second (it re-renders the HUD).
    let lastHover = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const now = performance.now();
        if (now - lastHover < 80) return;
        lastHover = now;
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

  // Dev-only debugging handle, next to window.__stormwatch.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __camera?: THREE.Camera }).__camera = camera;
  }, [camera]);

  // Direct-manipulation input (Watched's controls.ts): listeners only accumulate; the frame loop applies it.
  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const inp = input.current;
    const touch = () => {
      inp.lastInputAt = performance.now();
      lastInteraction.current = inp.lastInputAt;
      flight.current = null; // any gesture takes the camera back from a flight
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      inp.dragging = true;
      touch();
    };
    const onMove = (e: PointerEvent) => {
      const pt = pointers.get(e.pointerId);
      if (!pt) return;
      const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
      pt.x = e.clientX;
      pt.y = e.clientY;
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && d > 0 && useAppStore.getState().entered) inp.zoom += Math.log(pinch / d);
        pinch = d;
        inp.panX += dx / 2;
        inp.panY += dy / 2;
      } else {
        inp.panX += dx;
        inp.panY += dy;
      }
      touch();
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) pinch = 0;
      if (pointers.size === 0) inp.dragging = false;
      inp.lastInputAt = performance.now();
      lastInteraction.current = inp.lastInputAt;
    };
    const onWheel = (e: WheelEvent) => {
      if (!useAppStore.getState().entered) return; // the landing doesn't zoom
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      inp.zoom += THREE.MathUtils.clamp(e.deltaY * unit, -240, 240) * 0.0016;
      touch();
    };
    const onContext = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = useAppStore.getState();
    const f = flight.current;
    const P = pose.current;
    const inp = input.current;

    if (f) {
      const t = Math.min(1, (performance.now() - f.start) / f.duration);
      const e = easeInOutCubic(t);
      _q.copy(IDENTITY).slerp(f.q, e);
      _v.copy(f.from).applyQuaternion(_q);
      // Distance in log space (even apparent speed from orbit to street level), lifted over long hops.
      const a0 = Math.log(f.fromDist - 1), a1 = Math.log(f.toDist - 1);
      const dist = 1 + Math.exp(a0 + (a1 - a0) * e) + Math.sin(Math.PI * e) * f.arc;
      camera.position.copy(_v.multiplyScalar(dist));
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      poseFromCamera(camera, P);
      spin.current.lat = spin.current.lon = 0;
      zoomTarget.current = null;
      inp.panX = inp.panY = inp.zoom = 0;
      if (t >= 1) flight.current = null;
    } else {
      // Pan: the surface under the pointer follows it. Radians per pixel at the sub-camera point.
      const k = (P.alt * 2 * Math.tan((FOV / 2) * DEG)) / Math.max(1, size.height);
      const sp = spin.current;
      if (inp.panX !== 0 || inp.panY !== 0) {
        const dLon = (-inp.panX * k) / Math.max(0.2, Math.cos(P.lat));
        const dLat = inp.panY * k;
        P.lon += dLon;
        P.lat += dLat;
        const w = Math.min(1, dt / 0.05);
        sp.lon = sp.lon * (1 - w) + (dLon / Math.max(dt, 1 / 240)) * w;
        sp.lat = sp.lat * (1 - w) + (dLat / Math.max(dt, 1 / 240)) * w;
        inp.panX = inp.panY = 0;
      } else if (!inp.dragging && (sp.lat !== 0 || sp.lon !== 0)) {
        P.lon += sp.lon * dt;
        P.lat += sp.lat * dt;
        const decay = Math.exp(-dt / SPIN_TAU);
        sp.lon *= decay;
        sp.lat *= decay;
        if (Math.abs(sp.lon) + Math.abs(sp.lat) < 1e-4) sp.lon = sp.lat = 0;
      } else if (inp.dragging) {
        const decay = Math.exp(-dt / HOLD_TAU); // holding still stops the throw
        sp.lon *= decay;
        sp.lat *= decay;
      }

      // Zoom: ease log altitude toward the accumulated target.
      const minA = Math.log(MIN_DIST - 1), maxA = Math.log(MAX_DIST - 1);
      if (inp.zoom !== 0) {
        zoomTarget.current = THREE.MathUtils.clamp((zoomTarget.current ?? Math.log(P.alt)) + inp.zoom, minA, maxA);
        inp.zoom = 0;
      }
      if (zoomTarget.current !== null) {
        const cur = Math.log(P.alt);
        const next = cur + (zoomTarget.current - cur) * (1 - Math.exp(-dt / ZOOM_TAU));
        P.alt = Math.exp(next);
        if (Math.abs(zoomTarget.current - next) < 1e-4) zoomTarget.current = null;
      }

      // Idle drift, ramping in after the last input (and only when nothing is locked in the app).
      const idle = (performance.now() - Math.max(lastInteraction.current, inp.lastInputAt)) / 1000;
      const drifting = s.entered ? !s.selection && idle > IDLE_MS / 1000 : idle > 2.5;
      if (drifting && !inp.dragging) {
        const ramp = Math.min(1, (idle - (s.entered ? IDLE_MS / 1000 : 2.5)) / DRIFT_RAMP_S);
        P.lon += (s.entered ? DRIFT_APP : DRIFT_LANDING) * DEG * dt * ramp * ramp;
      }

      P.lat = THREE.MathUtils.clamp(P.lat, -MAX_LAT * DEG, MAX_LAT * DEG);
      P.lon = Math.atan2(Math.sin(P.lon), Math.cos(P.lon));
      P.alt = THREE.MathUtils.clamp(P.alt, MIN_DIST - 1, (s.entered ? MAX_DIST : LANDING_MAX_DIST) - 1);
      applyPose(camera, P);
    }

    // The altitude read-out, a few times a second at most.
    const now = performance.now();
    if (now - lastPublish.current > 150) {
      lastPublish.current = now;
      const alt = (camera.position.length() - 1) * EARTH_RADIUS_KM;
      if (Math.abs(alt - lastAlt.current) / Math.max(1, lastAlt.current) > 0.01) {
        lastAlt.current = alt;
        s.setAltitude(alt);
      }
    }
  });

  return null;
}
