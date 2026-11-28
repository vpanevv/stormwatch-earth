import { NextResponse, type NextRequest } from "next/server";
import { readLatLon } from "@/lib/server/http";
import { LIGHTNING_REFRESH_S, LIGHTNING_WINDOW_MIN, LightningUnavailable, XWEATHER_ON, strikeSummary } from "@/lib/server/xweather";

/**
 * GET /api/lightning?lat=..&lon=..  →  live strikes within 100 km in the last 5 minutes (Xweather).
 * Coordinates are rounded to 0.1° (~11 km) so nearby lookups share one cached Xweather request.
 */
export async function GET(req: NextRequest) {
  const p = readLatLon(req.nextUrl.searchParams);
  if (!p) return NextResponse.json({ error: "lat and lon are required and must be in range" }, { status: 400 });
  const { lat, lon } = p;
  if (!XWEATHER_ON) return NextResponse.json({ available: false, reason: "not-configured" }, { headers: { "Cache-Control": "public, max-age=300" } });
  try {
    const strikes = await strikeSummary(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10);
    return NextResponse.json(
      { available: true, source: "xweather", windowMin: LIGHTNING_WINDOW_MIN, strikes, fetchedAt: Date.now() },
      { headers: { "Cache-Control": `public, max-age=60, s-maxage=${LIGHTNING_REFRESH_S}, stale-while-revalidate=${LIGHTNING_REFRESH_S}`, "Netlify-Vary": "query=lat|lon" } },
    );
  } catch (e) {
    const reason = e instanceof LightningUnavailable ? e.message : "upstream error";
    return NextResponse.json({ available: false, reason }, { headers: { "Cache-Control": "public, max-age=60", "Netlify-Vary": "query=lat|lon" } });
  }
}
