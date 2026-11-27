import { NextResponse, type NextRequest } from "next/server";
import { reverseGeocode } from "@/lib/server/geocoding";

/** GET /api/reverse?lat=..&lon=.. */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  }
  const result = await reverseGeocode(lat, lon);
  return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=86400", "Netlify-Vary": "query=lat|lon" } });
}
