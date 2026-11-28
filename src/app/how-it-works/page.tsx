import type { Metadata } from "next";
import { REPO_URL, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * A plain, server-rendered page explaining StormWatch: what it shows, where every number comes from, its limits and
 * privacy. The in-app "How this works" dialog says the same; this page exists so search engines (and people without
 * WebGL) can read it, and so it can be linked to.
 */
const TITLE = "How it works: live lightning & weather radar";
const DESCRIPTION =
  "How StormWatch shows live lightning strikes, weather radar, clouds, snow and 7-day forecasts on a 3D Earth, where the data comes from, and what it can't see.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/how-it-works" },
  // A page's own openGraph replaces the inherited one, so the preview card is named again here.
  openGraph: {
    type: "article",
    url: "/how-it-works",
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "StormWatch: the real Earth with a lightning strike" }],
  },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESCRIPTION, images: ["/twitter-image"] },
};

const SOURCES: [string, string, string][] = [
  ["Lightning strike counts", "Xweather (Vaisala's global lightning network): strikes within 100 km in the last 5 minutes", "Live"],
  ["Lightning flashes over the Americas", "NOAA's GOES-19 and GOES-18 Geostationary Lightning Mappers: every flash in the last 5 minutes", "Live"],
  ["Current weather, 48-hour and 7-day forecast, sunrise and sunset", "Open-Meteo", "Live"],
  ["Weather radar (rain and snow), last ~2 hours", "RainViewer", "Live"],
  ["Satellite view of a place, HD ground around it", "NASA GIBS (VIIRS, Blue Marble)", "Live"],
  ["Place search and names", "Open-Meteo geocoder, Photon, OpenStreetMap Nominatim, GeoNames", "Live"],
  ["Global cloud, temperature and wind fields; snow cover away from radar", "A climate model in the app", "Modelled"],
  ["Lightning strikes worldwide (the home page's estimate)", "NASA's LIS/OTD satellite lightning record: ~44 flashes a second, by season and time of day", "Estimated"],
  ["Typical lightning for each place and month", "NASA LIS/OTD satellite lightning climatology (1995–2014), GHRC DAAC", "Average"],
  ["Lightning flashes drawn on the globe, storm cells", "A simulation of where storms usually form", "Simulated"],
];

const FAQ: [string, string][] = [
  [
    "Is StormWatch free?",
    "Yes. There are no accounts, no ads and nothing to install: open the site in a browser and pick a place. It runs on free public weather data.",
  ],
  [
    "Where does the live lightning data come from?",
    "From Xweather, which runs a global lightning detection network. StormWatch shows how many strikes hit within 100 km of a place in the last 5 minutes, and on the home page, the most active storm it can find right now.",
  ],
  [
    "How current is the weather radar?",
    "The radar comes from RainViewer and refreshes every 10 minutes. The timeline plays back the last two hours of radar, and the last 24 hours of everything else.",
  ],
  [
    "How accurate is the forecast?",
    "The 48-hour and 7-day forecasts come from Open-Meteo, which blends national weather models. It is a model forecast, not an observation, so treat it as you would any weather app's.",
  ],
  [
    "Does it work on phones?",
    "Yes. The globe turns with a finger, pinches to zoom, and a long press drops a pin that names the nearest town and shows its weather.",
  ],
  [
    "Can I share a forecast?",
    "Yes. Any place's forecast can be copied as an image or saved as a PNG, with yesterday's real NASA satellite view of the place, or shared as a link that reopens it.",
  ],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "How it works", item: `${SITE_URL}/how-it-works` },
      ],
    },
  ],
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-14 font-display text-[28px] font-semibold leading-tight text-[#ece8e0] [font-stretch:85%]">{children}</h2>;
}

export default function HowItWorks() {
  return (
    <div className="min-h-dvh bg-void text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4 lg:px-12">
        <a href="/" className="font-serif text-[26px] leading-none">
          StormWatch<span className="text-accent">.</span>
        </a>
        <a href="/" className="border border-accent/50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-accent hover:bg-accent/10">
          Open the live globe →
        </a>
      </header>

      <main className="mx-auto max-w-[760px] px-6 pb-24 pt-12 text-[17px] leading-relaxed text-[#c9cfd6]">
        <nav aria-label="Breadcrumb" className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
          <a href="/" className="hover:text-ink">
            StormWatch
          </a>{" "}
          / How it works
        </nav>
        <h1 className="mt-4 font-display text-[clamp(38px,6vw,64px)] font-semibold leading-[0.95] text-[#ece8e0] [font-stretch:80%]">
          How StormWatch <span className="font-serif font-normal italic text-accent">works</span>.
        </h1>
        <p className="mt-6 text-[20px] text-[#d4d9df]">
          StormWatch is a free live lightning map, weather radar and forecast on a real-time 3D Earth. Pick any place and it
          shows the strikes, rain, snow and clouds around it, its current conditions, a 48-hour chart and a 7-day
          forecast. Every number is public data, labelled with where it came from.
        </p>

        <H2>Live lightning strikes</H2>
        <p className="mt-4">
          The home page leads with the most active thunderstorm on Earth right now: how many lightning strikes hit within
          100 km of it in the last five minutes, updated every few minutes. To find it, StormWatch looks where NOAA&apos;s
          GOES weather satellites, whose lightning cameras watch the Americas and nearby oceans day and night, see the
          densest flashes right now, and elsewhere where it is late afternoon (when storms peak), where the weather
          models see thunderstorms, and dozens of the world&apos;s lightning hotspots, then asks Xweather&apos;s
          detection network which one is striking most. Beside it, every flash those satellites saw in the same five
          minutes, and an
          estimate of the whole planet&apos;s lightning in the same five minutes: NASA&apos;s satellites recorded about
          44 flashes a second on average, more in the northern summer and in the late-afternoon hours over the
          Americas and Africa. Open any city and
          its own strike count appears next to the forecast, and the forecast panel flashes when lightning is hitting
          nearby. Next to it is what is normal there: NASA&apos;s 20-year satellite record of lightning, for the same
          100 km and the same month, so a quiet day reads as quiet, and a storm in a usually calm place stands out.
        </p>

        <H2>Weather radar, clouds and snow on a 3D globe</H2>
        <p className="mt-4">
          Rain and snow come from RainViewer&apos;s worldwide radar mosaic, decoded back to reflectivity and painted onto a
          photoreal Earth lit by the real sun, with city lights on the night side. Clouds, snow cover, temperature and
          wind are layers you switch on and off. A timeline plays back the last 24 hours at ×1, ×5 or ×10.
        </p>

        <H2>Forecasts for any place</H2>
        <p className="mt-4">
          Search a city, region or country, type coordinates, use your location, or click anywhere on the globe to drop a
          pin that names the nearest town. You get the conditions now (temperature, feels-like, wind, humidity, rain,
          snow, pressure), the next sunrise or sunset, 24 hourly cards, a 48-hour chart and the next 7 days, from
          Open-Meteo.
        </p>

        <H2>Where the data comes from</H2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[15px]">
            <thead>
              <tr className="border-b border-white/15 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                <th className="py-2 pr-4 font-normal">What</th>
                <th className="py-2 pr-4 font-normal">From</th>
                <th className="py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map(([what, from, status]) => (
                <tr key={what} className="border-b border-white/10 align-top">
                  <td className="py-2.5 pr-4 text-[#ece8e0]">{what}</td>
                  <td className="py-2.5 pr-4">{from}</td>
                  <td className={`py-2.5 font-mono text-[12px] ${status === "Live" ? "text-emerald-300" : "text-amber-300"}`}>{status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H2>What it can&apos;t see</H2>
        <p className="mt-4">
          Radar only exists where countries run it and share it, so oceans and parts of Africa and Asia have none. The
          forecast is a model run, not an observation. Lightning counts cover the last five minutes within 100 km of a
          point, not the whole planet at once. Warnings are worked out from forecast thresholds; they are not official
          bulletins, so follow your national weather service in severe weather.
        </p>

        <H2>Privacy</H2>
        <p className="mt-4">
          No accounts, no analytics, no cookies. Your last place is kept in your own browser. A forecast or name lookup
          sends that place&apos;s coordinates through StormWatch&apos;s server to the weather providers above; your location
          is only used when you ask for it.
        </p>

        <H2>Questions</H2>
        <dl className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-4">
              <dt className="text-[18px] text-[#ece8e0]">{q}</dt>
              <dd className="mt-1.5">{a}</dd>
            </div>
          ))}
        </dl>

        <H2>Open source</H2>
        <p className="mt-4">
          StormWatch is MIT-licensed. The code, and the credits for every data source, texture and font, are on{" "}
          <a href={REPO_URL} rel="noopener" className="text-[#ece8e0] underline decoration-white/30 underline-offset-4 hover:text-accent">
            GitHub
          </a>
          .
        </p>

        <p className="mt-14">
          <a href="/" className="border border-accent/50 bg-accent/10 px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-accent hover:bg-accent/20">
            Open the live globe →
          </a>
        </p>
      </main>
    </div>
  );
}
