import type { MetadataRoute } from "next";
import { lab } from "@/lab/registry";
import { absoluteUrl, labPath } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...lab.map(({ slug }) => ({
      url: absoluteUrl(labPath(slug)),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
