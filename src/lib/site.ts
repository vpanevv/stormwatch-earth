/**
 * One place for what the site says about itself: used by the page metadata, the structured data (JSON-LD), the
 * sitemap, robots.txt and the link-preview card, so they never disagree.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || "https://stormwatch.earth").replace(/\/$/, "");
export const SITE_NAME = "StormWatch Earth";
export const SHORT_NAME = "StormWatch";
export const REPO_URL = "https://github.com/vpanevv/stormwatch-earth";
export const AUTHOR = { name: "vpanevv", url: "https://github.com/vpanevv" };

/** ≤ 60 characters: what people search for, then the brand. */
export const TITLE = "Live Lightning Map, Weather Radar & 3D Globe | StormWatch";
/** ≤ 160 characters. */
export const DESCRIPTION =
  "Watch live lightning strikes, weather radar, clouds and snow on a real-time 3D Earth. Free 48-hour and 7-day forecast for any city. No sign-up.";
export const TAGLINE = "Every storm, watched live from orbit.";

export const KEYWORDS = [
  "live lightning map",
  "lightning tracker",
  "real-time lightning strikes",
  "weather radar",
  "live weather radar map",
  "rain radar",
  "3D weather globe",
  "storm tracker",
  "thunderstorm map",
  "snow forecast",
  "7-day weather forecast",
  "48-hour forecast",
  "weather map",
  "cloud map",
  "sunrise and sunset times",
  "weather from space",
];

export const FEATURES = [
  "Live lightning strike counts from Xweather, for the most active storm on Earth and for any place you pick",
  "Live weather radar (RainViewer) for rain and snow, played back over the last two hours",
  "A photoreal 3D Earth with clouds, snow cover, temperature and wind layers, lit by the real sun",
  "Current conditions, a 48-hour chart and a 7-day forecast for any city (Open-Meteo)",
  "Click anywhere on the globe to see the nearest town and its weather",
  "Share a forecast as an image with yesterday's real NASA satellite view of the place",
];
