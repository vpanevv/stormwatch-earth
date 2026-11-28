import { NextResponse } from "next/server";
import { XWEATHER_ON, LIGHTNING_WINDOW_MIN } from "@/lib/server/xweather";
import { HOTSPOT_REFRESH_S, cachedHotspot } from "@/lib/server/stormHotspot";

export const dynamic = "force-dynamic";

/** GET /api/lightning/hotspot  →  the most active storm right now and its live strike count (landing page). */
export async function GET() {
  if (!XWEATHER_ON) return NextResponse.json({ available: false, reason: "not-configured" }, { headers: { "Cache-Control": "public, max-age=300" } });
  try {
    const hotspot = await cachedHotspot();
    return NextResponse.json(
      { available: true, source: "xweather", windowMin: LIGHTNING_WINDOW_MIN, ...hotspot },
      { headers: { "Cache-Control": `public, max-age=60, s-maxage=${HOTSPOT_REFRESH_S}, stale-while-revalidate=${HOTSPOT_REFRESH_S}` } },
    );
  } catch (e) {
    console.error("[lightning/hotspot]", e);
    return NextResponse.json({ available: false, reason: "upstream error" }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}
