import { NextResponse } from "next/server";
import { XWEATHER_ON, LIGHTNING_WINDOW_MIN } from "@/lib/server/xweather";
import { cachedHotspot, safeMessage } from "@/lib/server/stormHotspot";

export const dynamic = "force-dynamic";

/** GET /api/lightning/hotspot  →  the most active storm right now and its live strike count (landing page). */
export async function GET() {
  if (!XWEATHER_ON) return NextResponse.json({ available: false, reason: "not-configured" }, { headers: { "Cache-Control": "public, max-age=300" } });
  try {
    const hotspot = await cachedHotspot();
    return NextResponse.json(
      { available: true, source: "xweather", windowMin: LIGHTNING_WINDOW_MIN, ...hotspot },
      // The shared store keeps Xweather to one round per HOTSPOT_REFRESH_S; the CDN only needs to spare the function.
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300" } },
    );
  } catch (e) {
    console.error("[lightning/hotspot]", safeMessage(e));
    // The detail carries no keys (safeMessage strips them); it makes a failure diagnosable from outside.
    return NextResponse.json({ available: false, reason: "upstream error", detail: safeMessage(e) }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}
