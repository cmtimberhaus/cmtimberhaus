import type { MetadataRoute } from "next";
import { categories, getPieces, pieceHref } from "@/lib/content";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const pieces = await getPieces();
  const paths = [
    "/",
    ...categories.map((category) => `/${category}`),
    ...pieces.map(pieceHref),
    "/materials",
    "/about",
    "/enquire",
  ];
  return paths.map((path) => ({ url: `${base}${path === "/" ? "" : path}` }));
}
