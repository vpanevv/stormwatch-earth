/**
 * An estimate of how much lightning strikes the whole Earth, from NASA's satellite lightning record (the LIS and OTD
 * instruments, 1995–2015): about 44 flashes a second on average (Christian et al. 2003, J. Geophys. Res.,
 * doi:10.1029/2002JD002347). It varies with the season, from about 35/s in February to about 55/s in August (most
 * land, and so most thunderstorms, is in the northern hemisphere), and with the time of day, peaking around
 * 20:00 UTC, the afternoon over the Americas and Africa.
 *
 * This is a climatological average, not an observation: no free feed counts every strike on Earth. Label it so.
 */
const MEAN_PER_SECOND = 44;
const SEASONAL_AMPLITUDE = 0.2; // ±20 %: ~35/s in early February, ~53/s at the start of August
const SEASONAL_PEAK_DAY = 213; // ~1 August
const DIURNAL_AMPLITUDE = 0.15; // ±15 % over the day
const DIURNAL_PEAK_UTC = 20;

/** Estimated lightning flashes per second over the whole Earth at `now`. */
export function globalFlashRate(now = Date.now()): number {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (now - start) / 86_400_000;
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  const seasonal = 1 + SEASONAL_AMPLITUDE * Math.cos((2 * Math.PI * (dayOfYear - SEASONAL_PEAK_DAY)) / 365.25);
  const diurnal = 1 + DIURNAL_AMPLITUDE * Math.cos((2 * Math.PI * (hour - DIURNAL_PEAK_UTC)) / 24);
  return MEAN_PER_SECOND * seasonal * diurnal;
}

/** Estimated strikes worldwide over the last `windowMin` minutes, rounded to the nearest 100. */
export function globalStrikeEstimate(now = Date.now(), windowMin = 5): number {
  return Math.round((globalFlashRate(now) * windowMin * 60) / 100) * 100;
}
