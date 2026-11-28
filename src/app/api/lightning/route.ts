import { NextResponse, type NextRequest } from "next/server";
import { LIGHTNING_REFRESH_S, LIGHTNING_WINDOW_MIN, LightningUnavailable, XWEATHER_ON, strikeSummary } from "@/lib/server/xweather";

/**
 * GET /api/lightning?lat=..&lon=..  →  live strikes within 100 km in the last 5 minutes (Xweather).
 * Coordinates are rounded to 0.1° (~11 km) so nearby lookups share one cached Xweather request.
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat/lon out of range" }, { status: 400 });
  }
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
