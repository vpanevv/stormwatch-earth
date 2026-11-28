import type { Metadata, Viewport } from "next";
// Self-hosted (next/font/local under the hood): no Google Fonts fetch at build or dev time.
import { GeistSans as sans } from "geist/font/sans";
import { GeistMono as mono } from "geist/font/mono";
// Editorial faces for the landing / about pages (SIL OFL 1.1, self-hosted via Fontsource).
import "@fontsource-variable/instrument-sans/wdth.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import { AUTHOR, DESCRIPTION, FEATURES, KEYWORDS, REPO_URL, SHORT_NAME, SITE_NAME, SITE_URL, TITLE } from "@/lib/site";

export const metadata: Metadata = {
  // Absolute base for canonical URLs and link previews (og:image must be a full URL for Facebook and LinkedIn).
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | ${SHORT_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: KEYWORDS,
  authors: [AUTHOR],
  creator: AUTHOR.name,
  publisher: AUTHOR.name,
  category: "weather",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  // Search Console / Bing Webmaster verification, set in Netlify's environment when you register the site.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  appleWebApp: { title: SHORT_NAME, capable: true, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, address: false, email: false },
};

/** schema.org description of the site and the app, for Google's understanding and rich results. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      alternateName: SHORT_NAME,
      description: DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#author` },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: DESCRIPTION,
      applicationCategory: "UtilitiesApplication",
      applicationSubCategory: "Weather",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript and WebGL",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: FEATURES,
      keywords: KEYWORDS.join(", "),
      image: `${SITE_URL}/opengraph-image`,
      screenshot: `${SITE_URL}/opengraph-image`,
      author: { "@id": `${SITE_URL}/#author` },
      sameAs: [REPO_URL],
    },
    { "@type": "Person", "@id": `${SITE_URL}/#author`, name: AUTHOR.name, url: AUTHOR.url },
  ],
};

export const viewport: Viewport = {
  themeColor: "#020306",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans font-light">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
      </body>
    </html>
  );
}
