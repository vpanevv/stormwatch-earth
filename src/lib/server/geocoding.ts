import "server-only";
import type { Place, PlaceKind } from "@/types/weather";
import { createThrottledCache, fetchJson } from "./http";
import { searchGazetteer } from "@/lib/gazetteer";

const UA = process.env.NOMINATIM_USER_AGENT?.trim() || "StormWatchEarth/0.1";

type OMGeo = {
  results?: {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    country_code?: string;
    admin1?: string;
    feature_code?: string;
  }[];
};

/**
 * Autocomplete: Open-Meteo's geocoder is built for search-as-you-type
 * (Nominatim's policy forbids autocomplete), merged with a small local gazetteer
 * so countries, regions and the showcase places always resolve instantly.
 */
export async function suggestPlaces(q: string): Promise<{ places: Place[]; source: "open-meteo" | "mock" }> {
  const local = searchGazetteer(q, 4);
  try {
    const u = new URLSearchParams({ name: q, count: "8", language: "en", format: "json" });
    const d = await fetchJson<OMGeo>(`https://geocoding-api.open-meteo.com/v1/search?${u}`, {
      revalidate: 86_400,
      timeoutMs: 4000,
    });
    const remote: Place[] = (d.results ?? []).map((r) => ({
      id: `om-${r.id}`,
      name: r.name,
      context: [r.admin1, r.country].filter(Boolean).join(", "),
      kind: featureKind(r.feature_code),
      lat: r.latitude,
      lon: r.longitude,
      countryCode: r.country_code,
    }));
    return { places: dedupe([...local, ...remote]).slice(0, 8), source: "open-meteo" };
  } catch {
    return { places: local, source: "mock" };
  }
}

type NomSearch = {
  place_id: number;
  lat: string;
  lon: string;
  name: string;
  display_name: string;
  addresstype?: string;
  type?: string;
}[];

const nominatimQueue = createThrottledCache<unknown>(1100, 24 * 3_600_000);

/** Full search on submit (cities, regions, countries, landmarks) via Nominatim, throttled to 1 req/s. */
export async function searchPlaces(q: string): Promise<{ places: Place[]; source: "nominatim" | "mock" }> {
  try {
    const d = (await nominatimQueue(`s:${q.toLowerCase()}`, () =>
      fetchJson<NomSearch>(
        `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "jsonv2", limit: "8" })}`,
        { headers: { "User-Agent": UA, "Accept-Language": "en" }, revalidate: 86_400 },
      ),
    )) as NomSearch;
    const places = d.map<Place>((r) => {
      const parts = r.display_name.split(",").map((s) => s.trim());
      return {
        id: `osm-${r.place_id}`,
        name: r.name || parts[0],
        context: parts.slice(1).filter((s) => !/^\d+$/.test(s)).slice(-2).join(", "),
        kind: nominatimKind(r.addresstype ?? r.type),
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
      };
    });
    return { places, source: "nominatim" };
  } catch {
    return { places: searchGazetteer(q, 8), source: "mock" };
  }
}

type NomReverse = { display_name?: string; name?: string; address?: Record<string, string>; error?: string };
type PhotonReverse = {
  features?: {
    properties?: { name?: string; city?: string; town?: string; village?: string; county?: string; state?: string; country?: string; countrycode?: string; type?: string };
  }[];
};
type Reverse = { place: Place | null; source: "photon" | "nominatim" | "mock" };

/** How long Photon has to answer before Nominatim is asked as well (Watched: REVERSE_HEDGE_MS). */
const REVERSE_HEDGE_MS = 1_200;

/**
 * Reverse geocoding, as Watched does it: Photon (komoot, OSM data, no rate limit to speak of) first; if it hasn't
 * answered in 1.2 s, Nominatim is asked too (throttled to 1 req/s) and whichever names the spot first wins.
 * `place: null` means neither knows a name there (open sea).
 */
export async function reverseGeocode(lat: number, lon: number): Promise<Reverse> {
  const photon = photonReverse(lat, lon)
    .then((place) => (place ? ({ place, source: "photon" } as const) : null))
    .catch(() => null);
  const quick = await Promise.race([photon, new Promise<undefined>((r) => setTimeout(() => r(undefined), REVERSE_HEDGE_MS))]);
  if (quick) return quick;
  // Photon is slow, or knows no name here: ask Nominatim too, and take the first that names the spot.
  const nominatim = nominatimReverse(lat, lon)
    .then((place) => (place ? ({ place, source: "nominatim" } as const) : null))
    .catch(() => null);
  return (await firstNamed<Reverse>([photon, nominatim])) ?? { place: null, source: "photon" };
}

/** The first promise to resolve to a value; null once all resolved to null. */
function firstNamed<T>(ps: Promise<T | null>[]): Promise<T | null> {
  return new Promise((resolve) => {
    let left = ps.length;
    for (const p of ps)
      p.then((v) => {
        if (v) resolve(v);
        else if (--left === 0) resolve(null);
      });
  });
}

async function photonReverse(lat: number, lon: number): Promise<Place | null> {
  const d = await fetchJson<PhotonReverse>(
    `https://photon.komoot.io/reverse?${new URLSearchParams({ lat: String(lat), lon: String(lon), lang: "en", limit: "1" })}`,
    { headers: { "User-Agent": UA }, revalidate: 86_400, timeoutMs: 6_000 },
  );
  const f = d.features?.[0]?.properties;
  if (!f) return null;
  const name = f.city || f.town || f.village || f.name || f.county || f.state;
  if (!name) return null;
  return {
    id: `rev-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    name,
    context: [f.state, f.country].filter((x) => x && x !== name).join(", "),
    kind: "place",
    lat,
    lon,
    countryCode: f.countrycode?.toUpperCase(),
  };
}

async function nominatimReverse(lat: number, lon: number): Promise<Place | null> {
  const key = `r:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const d = (await nominatimQueue(key, () =>
    fetchJson<NomReverse>(
      `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        format: "jsonv2",
        zoom: "10",
      })}`,
      { headers: { "User-Agent": UA, "Accept-Language": "en" }, revalidate: 86_400 },
    ),
  )) as NomReverse;
  if (d.error || !d.address) return null;
  const a = d.address;
  const name = a.city || a.town || a.village || a.municipality || a.county || a.state || d.name;
  if (!name) return null;
  return {
    id: `rev-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    name,
    context: [a.state, a.country].filter((x) => x && x !== name).join(", "),
    kind: "place",
    lat,
    lon,
    countryCode: a.country_code?.toUpperCase(),
  };
}

function featureKind(code?: string): PlaceKind {
  if (!code) return "place";
  if (code.startsWith("PCL")) return "country";
  if (code.startsWith("ADM")) return "region";
  if (code.startsWith("PPL")) return "city";
  return "place";
}

function nominatimKind(t?: string): PlaceKind {
  if (!t) return "place";
  if (t === "country") return "country";
  if (["state", "region", "province", "county", "state_district", "administrative"].includes(t)) return "region";
  if (["city", "town", "village", "hamlet", "municipality", "suburb"].includes(t)) return "city";
  return "place";
}

function dedupe(list: Place[]) {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = `${p.name.toLowerCase()}|${p.lat.toFixed(1)}|${p.lon.toFixed(1)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
