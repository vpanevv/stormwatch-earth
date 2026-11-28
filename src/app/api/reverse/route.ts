import { NextResponse, type NextRequest } from "next/server";
import { reverseGeocode } from "@/lib/server/geocoding";
import { readLatLon } from "@/lib/server/http";

/** GET /api/reverse?lat=..&lon=.. */
export async function GET(req: NextRequest) {
  const p = readLatLon(req.nextUrl.searchParams);
  if (!p) return NextResponse.json({ error: "lat and lon are required and must be in range" }, { status: 400 });
  const result = await reverseGeocode(p.lat, p.lon);
  return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=86400", "Netlify-Vary": "query=lat|lon" } });
}
