"use client";

import type { Place } from "@/types/weather";
import { countryName, nearestLocal } from "./nearest";

export type PinName = { name: string; context: string; countryCode?: string; source: "local" | "photon" | "nominatim" };

/**
 * The name of a dropped pin, as Watched names its pins: the offline list's town whose reach covers the spot (instant
 * after the first tile, no network geocoder involved); else /api/reverse (Photon, hedged with Nominatim). Null when
 * nothing names the spot (open sea). Throws only on abort.
 */
export async function namePin(lat: number, lon: number, signal?: AbortSignal): Promise<PinName | null> {
  try {
    const town = await nearestLocal(lat, lon);
    if (town) {
      const country = countryName(town.cc);
      return {
        name: town.name,
        context: [town.admin1, country].filter((x, i, a) => x && x !== town.name && a.indexOf(x) === i).join(", "),
        countryCode: town.cc,
        source: "local",
      };
    }
  } catch {
    // A tile didn't load: ask the network.
  }
  signal?.throwIfAborted();
  try {
    const r = await fetch(`/api/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, { signal });
    const d = (await r.json()) as { place: Place | null; source: "photon" | "nominatim" | "mock" };
    if (!d.place) return null;
    return { name: d.place.name, context: d.place.context ?? "", countryCode: d.place.countryCode, source: d.source === "nominatim" ? "nominatim" : "photon" };
  } catch (e) {
    if (signal?.aborted) throw e;
    return null;
  }
}
