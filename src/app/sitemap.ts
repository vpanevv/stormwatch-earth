import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Every page that should be in search results. Shared place links (/?q=…) are the home page, not separate pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];
}
