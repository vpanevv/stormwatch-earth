import "server-only";

export class UpstreamError extends Error {
  constructor(
    public readonly upstream: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** fetch + timeout + JSON, with Next's data cache for `revalidate` seconds. */
export async function fetchJson<T>(
  url: string,
  { revalidate = 300, timeoutMs = 7000, headers }: { revalidate?: number; timeoutMs?: number; headers?: HeadersInit } = {},
): Promise<T> {
  const upstream = new URL(url).host;
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
    next: { revalidate },
  });
  if (!res.ok) throw new UpstreamError(upstream, res.status, `${upstream} responded ${res.status}`);
  return (await res.json()) as T;
}

/** Tiny in-memory TTL cache + serialiser for providers with strict rate limits (Nominatim: 1 req/s). */
export function createThrottledCache<T>(minIntervalMs: number, ttlMs: number, max = 500) {
  const cache = new Map<string, { at: number; value: T }>();
  let chain = Promise.resolve();
  let last = 0;
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const run = chain.then(async () => {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return load();
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    const value = await run;
    cache.set(key, { at: Date.now(), value });
    if (cache.size > max) cache.delete(cache.keys().next().value as string);
    return value;
  };
}

/** lat/lon from a request's query, or null when either is missing, not a number, or out of range. */
export function readLatLon(params: URLSearchParams): { lat: number; lon: number } | null {
  const rawLat = params.get("lat"), rawLon = params.get("lon");
  if (rawLat === null || rawLon === null || rawLat.trim() === "" || rawLon.trim() === "") return null;
  const lat = Number(rawLat), lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
