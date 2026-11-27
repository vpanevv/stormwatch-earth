"use client";

import type { LatLon, Place } from "@/types/weather";
import { useAppStore } from "@/store/useAppStore";
import { formatLat, formatLon } from "@/lib/geo";

/** Camera distance (in Earth radii from the centre) that frames each kind of place. */
export const FRAME_DISTANCE: Record<Place["kind"], number> = {
  city: 1.75,
  place: 1.75,
  coords: 1.75,
  device: 1.7,
  region: 2.0,
  country: 2.25,
};

export function selectPlace(p: Place) {
  useAppStore.getState().select(p, { distance: FRAME_DISTANCE[p.kind] });
}

/** Select a raw coordinate immediately, then upgrade its label via reverse geocoding. */
export async function selectCoordinates(p: LatLon, opts?: { distance?: number; kind?: "coords" | "device" }) {
  const kind = opts?.kind ?? "coords";
  const id = `${kind}-${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
  const place: Place = {
    id,
    name: kind === "device" ? "My location" : `${formatLat(p.lat, 2)} ${formatLon(p.lon, 2)}`,
    context: kind === "device" ? "Device position" : "Coordinates",
    kind,
    lat: p.lat,
    lon: p.lon,
  };
  useAppStore.getState().select(place, { distance: opts?.distance ?? FRAME_DISTANCE[kind] });
  try {
    const res = await fetch(`/api/reverse?lat=${p.lat}&lon=${p.lon}`);
    const d = (await res.json()) as { place: Place | null };
    const cur = useAppStore.getState().selection;
    if (d.place && cur?.id === id) {
      useAppStore.getState().select(
        { ...cur, name: d.place.name, context: [d.place.context, kind === "device" ? "your location" : null].filter(Boolean).join(" · ") },
        { fly: false },
      );
    } else if (!d.place && cur?.id === id && kind === "coords") {
      useAppStore.getState().select({ ...cur, name: "Open water", context: "No named place nearby" }, { fly: false });
    }
  } catch {
    /* keep the coordinate label */
  }
}

export function useMyLocation() {
  const setGeolocating = useAppStore((s) => s.setGeolocating);
  return () => {
    if (!("geolocation" in navigator)) return Promise.reject(new Error("Geolocation unavailable"));
    setGeolocating(true);
    return new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeolocating(false);
          selectCoordinates({ lat: pos.coords.latitude, lon: pos.coords.longitude }, { kind: "device" });
          resolve();
        },
        (err) => {
          setGeolocating(false);
          reject(err);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
      );
    });
  };
}
