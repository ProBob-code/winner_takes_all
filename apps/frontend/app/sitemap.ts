import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/page-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...Object.keys(PUBLIC_PAGES)].map(path => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
  }));
}
