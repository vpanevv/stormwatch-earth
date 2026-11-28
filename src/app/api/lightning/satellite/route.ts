import { NextResponse } from "next/server";
import { cachedGlm } from "@/lib/server/glm";
import { safeMessage } from "@/lib/server/stormHotspot";
import { reverseGeocode } from "@/lib/server/geocoding";
import type { SatelliteLightning } from "@/types/weather";

export const dynamic = "force-dynamic";

/** The GOES files arrive every 20 s; 3 minutes of CDN cache keeps a "last 5 minutes" count honest and cheap. */
const CACHE_S = 180;

/** GET /api/lightning/satellite  →  lightning flashes seen by NOAA's GOES satellites in the last 5 minutes. */
export async function GET() {
  try {
    const g = await cachedGlm();
    // Name the busiest storm (a place, or the country / sea it's over); nameless at sea is fine.
    const top = g.clusters[0];
    const named = top ? await reverseGeocode(top.lat, top.lon).catch(() => null) : null;
    const topName = named?.place ? [named.place.name, named.place.context?.split(", ").pop()].filter(Boolean).join(", ") : undefined;
    const body: SatelliteLightning = {
      available: true,
      source: "noaa-goes-glm",
      region: "the Americas",
      flashes: g.flashes,
      windowMin: g.windowMin,
      from: g.from,
      to: g.to,
      satellites: g.satellites.map(({ name, flashes, error }) => ({ name, flashes, ...(error ? { error } : {}) })),
      clusters: g.clusters.slice(0, 3).map((c, i) => (i === 0 && topName ? { ...c, name: topName } : c)),
      fetchedAt: g.fetchedAt,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": `public, max-age=60, s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S}` } });
  } catch (e) {
    console.error("[lightning/satellite]", safeMessage(e));
    const body: SatelliteLightning = { available: false, reason: "upstream error" };
    return NextResponse.json({ ...body, detail: safeMessage(e) }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}
