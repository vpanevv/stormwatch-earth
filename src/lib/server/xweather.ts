import "server-only";

/**
 * Live lightning from Xweather (Vaisala's global network) — https://www.xweather.com/docs/weather-api/endpoints/lightning-summary
 *
 * The free Developer plan (15,000 accesses a month) covers the standard lightning access: strikes within 100 km of a
 * point in the last 5 minutes. Every call is cached (see LIGHTNING_REFRESH_S) so all visitors share one request per
 * place per window, and the cost Xweather charges for each call (X-Cost-Tokens) is logged so the budget can be watched.
 * Keys stay on the server: XWEATHER_CLIENT_ID and XWEATHER_CLIENT_SECRET.
 */
const ID = process.env.XWEATHER_CLIENT_ID?.trim() || "";
const SECRET = process.env.XWEATHER_CLIENT_SECRET?.trim() || "";
export const XWEATHER_ON = Boolean(ID && SECRET);
/** Seconds a lightning count is reused for before Xweather is asked again. */
export const LIGHTNING_REFRESH_S = Math.max(60, Number(process.env.LIGHTNING_REFRESH_SECONDS) || 600);
/** Standard access radius (the free plan's maximum). */
export const LIGHTNING_RADIUS_KM = 100;
/** Standard access window, minutes. */
export const LIGHTNING_WINDOW_MIN = 5;

/** Xweather keys are tied to a namespace (the site's domain); requests from the server say which site they're for. */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || "https://stormwatch.earth";

export type StrikeSummary = {
  /** Lightning pulses (strikes) detected within the radius during the window. */
  count: number;
  /** Cloud-to-ground and in-cloud split. */
  cg: number;
  ic: number;
  /** The window Xweather counted over (ms epoch). */
  from: number;
  to: number;
  radiusKm: number;
  /** Xweather accesses this request cost (X-Cost-Tokens), when it reported one; for watching the monthly budget. */
  costTokens?: number;
};

type SummaryResponse = {
  success: boolean;
  error: { code: string; description: string } | null;
  response?:
    | { summary?: { range?: { count?: number; fromTimestamp?: number; toTimestamp?: number }; pulse?: { count?: number; cg?: number; ic?: number } } }
    | { summary?: unknown }[];
};

export class LightningUnavailable extends Error {}

/** Strikes within `radiusKm` of (lat, lon) in Xweather's window (the last 5 minutes on standard access). */
export async function strikeSummary(lat: number, lon: number, radiusKm = LIGHTNING_RADIUS_KM): Promise<StrikeSummary> {
  if (!XWEATHER_ON) throw new LightningUnavailable("Xweather is not configured");
  const q = new URLSearchParams({
    p: `${lat.toFixed(3)},${lon.toFixed(3)}`,
    radius: `${radiusKm}km`,
    client_id: ID,
    client_secret: SECRET,
  });
  const res = await fetch(`https://data.api.xweather.com/lightning/summary/closest?${q}`, {
    headers: { Accept: "application/json", Referer: SITE },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: LIGHTNING_REFRESH_S },
  });
  const cost = res.headers.get("x-cost-tokens");
  if (cost) console.info(`[xweather] lightning/summary ${lat.toFixed(2)},${lon.toFixed(2)} cost ${cost} accesses`);
  if (!res.ok) throw new LightningUnavailable(`Xweather responded ${res.status}`);
  const d = (await res.json()) as SummaryResponse;
  const now = Date.now();
  const costTokens = cost ? Number(cost) : undefined;
  const empty: StrikeSummary = { count: 0, cg: 0, ic: 0, from: now - LIGHTNING_WINDOW_MIN * 60_000, to: now, radiusKm, costTokens };
  // "warn_no_data" is Xweather's way of saying nothing was found: zero strikes, not a failure.
  if (d.error?.code === "warn_no_data") return empty;
  if (!d.success) throw new LightningUnavailable(`Xweather ${d.error?.code ?? "error"}: ${d.error?.description ?? "no description"}`);
  const r = Array.isArray(d.response) ? d.response[0] : d.response;
  const s = (r?.summary ?? {}) as { range?: { count?: number; fromTimestamp?: number; toTimestamp?: number }; pulse?: { count?: number; cg?: number; ic?: number } };
  return {
    count: s.pulse?.count ?? s.range?.count ?? 0,
    cg: s.pulse?.cg ?? 0,
    ic: s.pulse?.ic ?? 0,
    from: s.range?.fromTimestamp ? s.range.fromTimestamp * 1000 : empty.from,
    to: s.range?.toTimestamp ? s.range.toTimestamp * 1000 : empty.to,
    radiusKm,
    costTokens,
  };
}
