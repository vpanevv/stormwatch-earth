# StormWatch Earth

A real-time weather observatory on an interactive 3D Earth. You can see live radar, clouds, lightning, wind and
temperature, search any place, lock onto it, and play back the last 24 hours.

Built with Next.js 15, React 19, React Three Fiber, Drei, Zustand, Tailwind CSS 4, Framer Motion and MapLibre.

## What you get

- **A welcome page** with an editorial hero over a slowly turning planet. Search a place (`/` focuses the field),
  use your location, pick a suggestion or **Surprise me**, or click the globe to drop a pin. Each one dives straight in.
  **How this works** (`?`) opens a full-page explainer covering data sources, how to read the globe, limits, privacy, credits and keys.
  The layout and motion follow [Watched](https://github.com/dev-Armaan/satellites)'s landing (MIT).
- **The forecast as the main view**: a large deck under the globe with the current conditions, 24 hourly cards, a
  48-hour chart (temperature, rain, snow, cloud, night shading, a now line and the playback head, with hover read-outs) and 7-day cards.
  Your last place is remembered.
- **Snow throughout**: seasonal snow and sea-ice cover on the globe, worldwide falling snow (RainViewer's snow channel
  plus modelled snowfall wherever it's below freezing), snowfall and snow depth in every panel, snowfall warnings,
  and falling-snow particles on the forecast when it's snowing.
- **A more realistic Earth**: reddened low sun, skylight and aerial haze, ocean Fresnel reflection and wave-broken sun glint,
  cloud shadows offset toward the sun, puffy self-shadowed clouds with silver linings, Mie scattering on the limb,
  an HDR sun, and bloom. Bloom switches off automatically on slow GPUs.

- **Share a forecast**: once a place is locked, **Share** renders a card with yesterday's real NASA VIIRS satellite pass
  over the place (Blue Marble if the swath has gaps), the current conditions, rain and snow for the next 24 h, wind, cloud and a
  5-day strip. You can copy the image, save it as a PNG, copy a link that reopens the place, or share natively on phones.
- **HD globe**: an 8K day map is loaded progressively, and a sharp ~0.5 km/px NASA Blue Marble patch is painted in around the
  selected place (detail only, so there's no visible square). The coarse global cloud layer thins out on close views. The
  techniques are adapted from [Watched](https://github.com/dev-Armaan/satellites) (MIT).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

It works with **no API keys**. Live data comes from Open-Meteo (conditions and forecast), RainViewer
(radar), Open-Meteo and Nominatim (geocoding), and OpenStreetMap (local map). Copy `.env.example` to `.env.local` to
enable OpenWeather (current conditions plus global cloud and temperature tiles).

## What's live and what's simulated

Each panel and legend has a source badge: green for live, amber for simulated or modelled.

| Live | Simulated / modelled |
|---|---|
| Current weather, hourly and 7-day forecast | Lightning strikes and storm cells (no public Blitzortung API, see `docs/ARCHITECTURE.md`) |
| Radar precipitation, last ~2 h | Precipitation further back than the radar archive |
| Local cloud cover at the selected place | Global cloud, temperature and wind fields (unless OpenWeather is keyed) |
| Snowfall and snow depth for the selected place (Open-Meteo) and radar snow | Global snow cover and snowfall outside radar coverage (climate model) |
| Geocoding, reverse geocoding | Weather warnings are *derived* from forecast thresholds, not official bulletins |

## Controls

- **Drag** to rotate (with inertia), **scroll** to zoom, **double-click** to lock onto a point.
- **Click** the globe (or hold a finger still on it) to drop a pin: a card names the nearest town, shows the weather
  there, and its orange arrow (or Enter) opens that town's forecast. × or Esc removes it; a click on space does too.
  The town comes from an offline GeoNames list (each town's reach grows with its population), else from Photon reverse
  geocoding, hedged with Nominatim when Photon is slow — the same logic as [Watched](https://github.com/dev-Armaan/satellites)'s pins.
- **Search** a city, region or country, or type coordinates (`41.8831, 23.4673`, `41.88N 23.47E`).
- **Use my location** asks for browser geolocation.
- **Timeline**: play the last 24 h at ×1 / ×5 / ×10, scrub, step, or jump back to live.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system diagram, provider chain, component hierarchy,
  state design, rendering pipeline, API surface and next steps.

## Credits

Earth day, night and cloud textures © [Solar System Scope](https://www.solarsystemscope.com/textures/), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), based on NASA Blue Marble / Black Marble. They were resized,
re-encoded and channel-packed by the [Watched](https://github.com/dev-Armaan/satellites) project (MIT, © 2026 Armaan Gupta),
whose globe shading techniques (graded day map, bounded hill-shade, Fresnel glint, the thin exponential atmosphere, and
the regional context patch) are adapted here. The elevation map used by the climate model is from
[three-globe](https://github.com/vasturiano/three-globe) (MIT). The regional patches and share-card imagery come from
[NASA GIBS](https://www.earthdata.nasa.gov/gibs) (Blue Marble Next Generation; VIIRS on NOAA-20 / Suomi NPP).
Type: Instrument Sans and Instrument Serif (SIL OFL 1.1, via Fontsource) and Geist (SIL OFL 1.1).
Radar is © [RainViewer](https://www.rainviewer.com/). Map data is © OpenStreetMap contributors.
Weather data is from [Open-Meteo](https://open-meteo.com/) (free tier is non-commercial). Geocoding uses Nominatim (1 req/s policy, enforced server-side)
and [Photon](https://photon.komoot.io/) (komoot, OpenStreetMap data). The offline town list for dropped pins
(`public/places/`) is from [GeoNames](https://www.geonames.org/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)),
as tiled by Watched (MIT, © 2026 Armaan Gupta); its nearest-town logic is adapted in `src/lib/places/`.
