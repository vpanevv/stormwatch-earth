import type { Place, PlaceKind } from "@/types/weather";

/**
 * Offline gazetteer: instant suggestions and the fallback when geocoders are unreachable.
 * [name, context, kind, lat, lon]
 */
const ENTRIES: [string, string, PlaceKind, number, number][] = [
  ["Razlog", "Blagoevgrad, Bulgaria", "city", 41.8831, 23.4673],
  ["Sofia", "Bulgaria", "city", 42.6977, 23.3219],
  ["Plovdiv", "Bulgaria", "city", 42.1354, 24.7453],
  ["Varna", "Bulgaria", "city", 43.2141, 27.9147],
  ["Bansko", "Blagoevgrad, Bulgaria", "city", 41.8383, 23.4885],
  ["London", "England, United Kingdom", "city", 51.5074, -0.1278],
  ["Paris", "Île-de-France, France", "city", 48.8566, 2.3522],
  ["Berlin", "Germany", "city", 52.52, 13.405],
  ["Rome", "Lazio, Italy", "city", 41.9028, 12.4964],
  ["Madrid", "Spain", "city", 40.4168, -3.7038],
  ["Athens", "Attica, Greece", "city", 37.9838, 23.7275],
  ["Istanbul", "Türkiye", "city", 41.0082, 28.9784],
  ["Tokyo", "Japan", "city", 35.6762, 139.6503],
  ["Seoul", "South Korea", "city", 37.5665, 126.978],
  ["Beijing", "China", "city", 39.9042, 116.4074],
  ["Mumbai", "Maharashtra, India", "city", 19.076, 72.8777],
  ["Singapore", "Singapore", "city", 1.3521, 103.8198],
  ["Sydney", "New South Wales, Australia", "city", -33.8688, 151.2093],
  ["New York", "New York, United States", "city", 40.7128, -74.006],
  ["Miami", "Florida, United States", "city", 25.7617, -80.1918],
  ["Oklahoma City", "Oklahoma, United States", "city", 35.4676, -97.5164],
  ["Los Angeles", "California, United States", "city", 34.0522, -118.2437],
  ["Mexico City", "Mexico", "city", 19.4326, -99.1332],
  ["São Paulo", "Brazil", "city", -23.5505, -46.6333],
  ["Buenos Aires", "Argentina", "city", -34.6037, -58.3816],
  ["Cairo", "Egypt", "city", 30.0444, 31.2357],
  ["Lagos", "Nigeria", "city", 6.5244, 3.3792],
  ["Kinshasa", "DR Congo", "city", -4.4419, 15.2663],
  ["Nairobi", "Kenya", "city", -1.2921, 36.8219],
  ["Reykjavík", "Iceland", "city", 64.1466, -21.9426],
  ["Bulgaria", "Europe", "country", 42.7339, 25.4858],
  ["United Kingdom", "Europe", "country", 54.0, -2.5],
  ["Japan", "Asia", "country", 36.2048, 138.2529],
  ["United States", "North America", "country", 39.8283, -98.5795],
  ["Brazil", "South America", "country", -14.235, -51.9253],
  ["Australia", "Oceania", "country", -25.2744, 133.7751],
  ["India", "Asia", "country", 20.5937, 78.9629],
  ["Germany", "Europe", "country", 51.1657, 10.4515],
  ["Blagoevgrad Province", "Bulgaria", "region", 41.9, 23.3],
  ["Balkans", "Southeast Europe", "region", 43.0, 21.0],
  ["Tornado Alley", "Great Plains, United States", "region", 36.5, -98.0],
  ["Congo Basin", "Central Africa", "region", -0.5, 21.0],
  ["Lake Maracaibo", "Zulia, Venezuela", "region", 9.8, -71.55],
  ["Bay of Bengal", "Indian Ocean", "region", 15.0, 88.0],
  ["Sahara", "North Africa", "region", 23.4, 12.0],
];

export const GAZETTEER: Place[] = ENTRIES.map(([name, context, kind, lat, lon], i) => ({
  id: `gz-${i}`,
  name,
  context,
  kind,
  lat,
  lon,
}));

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function searchGazetteer(q: string, limit = 6): Place[] {
  const n = fold(q.trim());
  if (!n) return [];
  return GAZETTEER.map((p) => {
    const name = fold(p.name);
    const score = name === n ? 0 : name.startsWith(n) ? 1 : name.includes(n) ? 2 : fold(p.context ?? "").includes(n) ? 3 : 9;
    return { p, score };
  })
    .filter((x) => x.score < 9)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.p);
}

export const QUICK_PICKS = ["Razlog", "Sofia", "London", "Tokyo"].map(
  (n) => GAZETTEER.find((p) => p.name === n)!,
);
