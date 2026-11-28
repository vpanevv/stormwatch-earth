export type LatLon = { lat: number; lon: number };

export type PlaceKind = "city" | "region" | "country" | "coords" | "device" | "place";

export type Place = {
  id: string;
  name: string;
  /** Secondary line, e.g. "Blagoevgrad, Bulgaria" */
  context?: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  countryCode?: string;
};

/** Where a piece of data came from. Shown in the UI so live and simulated data are never confused. */
export type DataSource =
  | "openweather"
  | "open-meteo"
  | "rainviewer"
  | "nominatim"
  | "blitzortung"
  | "mock"
  | "model"
  | "xweather";

export type CurrentWeather = {
  time: number; // epoch ms
  temperature: number; // °C
  feelsLike: number;
  humidity: number; // %
  cloudCover: number; // %
  windSpeed: number; // km/h
  windGust: number; // km/h
  windDirection: number; // deg, meteorological (from)
  pressure: number; // hPa
  precipitation: number; // mm/h
  snowfall: number; // cm/h
  snowDepth: number; // cm on the ground
  weatherCode: number; // WMO code
  isDay: boolean;
};

export type HourlyPoint = {
  time: number; // epoch ms
  temperature: number;
  precipitation: number;
  snowfall: number; // cm
  snowDepth: number; // cm
  precipProbability: number;
  cloudCover: number;
  windSpeed: number;
  windGust: number;
  weatherCode: number;
  cape: number;
};

export type DailyPoint = {
  time: number; // epoch ms, local midnight
  tMax: number;
  tMin: number;
  precipSum: number;
  snowfallSum: number; // cm
  precipProbMax: number;
  windMax: number;
  weatherCode: number;
};

export type WarningLevel = "advisory" | "watch" | "warning";

export type WeatherWarning = {
  id: string;
  level: WarningLevel;
  title: string;
  detail: string;
  from: number;
  to: number;
  /** "derived" = computed from forecast thresholds, not an official bulletin */
  origin: "derived" | "provider";
};

export type WeatherBundle = {
  location: LatLon;
  timezone: string;
  utcOffsetSeconds: number;
  current: CurrentWeather;
  /** Roughly the last 24 h plus the next 48 h */
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  warnings: WeatherWarning[];
  sources: { current: DataSource; forecast: DataSource };
  fetchedAt: number;
};

export type RadarFrame = { time: number; path: string };

export type RadarIndex = {
  host: string;
  frames: RadarFrame[];
  source: DataSource;
};

export type LightningStrike = { lat: number; lon: number; time: number };

export type StormKind = "rain" | "thunderstorm" | "severe";

export type StormCell = {
  id: string;
  kind: StormKind;
  lat: number;
  lon: number;
  radiusKm: number;
  /** 0..1 */
  intensity: number;
  headingDeg: number;
  speedKmh: number;
  strikesPerMin: number;
  source: DataSource;
};

export type AppConfig = {
  openweather: boolean;
  lightningSource: DataSource;
  /** Xweather is configured: live strike counts for places and the landing page. */
  liveLightning?: boolean;
};

/** Live strikes from Xweather within `radiusKm` of a point, over its window (the last 5 minutes on the free plan). */
export type LiveStrikes = { count: number; cg: number; ic: number; from: number; to: number; radiusKm: number };

export type LiveLightning =
  | { available: true; source: "xweather"; windowMin: number; strikes: LiveStrikes; fetchedAt: number }
  | { available: false; reason: string };

/** The most active storm right now (landing page). */
export type LightningHotspot =
  | {
      available: true;
      source: "xweather";
      windowMin: number;
      place: Place;
      strikes: LiveStrikes;
      thunderstormPoints: number;
      sampled: number;
      fetchedAt: number;
    }
  | { available: false; reason: string };
