/** Formatting helpers. Times are shown in the selected place's local time when an offset is known. */

export function fmtTime(t: number, offsetSec?: number, withSeconds = false) {
  const d = new Date(t + (offsetSec ?? 0) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDay(t: number, offsetSec = 0) {
  return DAYS[new Date(t + offsetSec * 1000).getUTCDay()];
}

export function fmtDate(t: number, offsetSec = 0) {
  const d = new Date(t + offsetSec * 1000);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function fmtRelative(ms: number) {
  const neg = ms < 0;
  const m = Math.round(Math.abs(ms) / 60_000);
  const h = Math.floor(m / 60);
  const r = m % 60;
  const body = h ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`;
  return `${neg ? "−" : "+"}${body}`;
}

export function fmtOffset(sec: number) {
  const sign = sec >= 0 ? "+" : "−";
  const a = Math.abs(sec);
  const h = Math.floor(a / 3600);
  const m = Math.round((a % 3600) / 60);
  return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

export function fmtKm(km: number) {
  return km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString("en-US");
}

export function fmtInt(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
