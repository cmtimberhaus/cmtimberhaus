import type { Metadata } from "next";

const MAX_DESCRIPTION_LENGTH = 160;

export const SITE_NAME = "CM Timberhaus";

/** Shared Open Graph fields. Next replaces (not merges) `openGraph` per page, so every page spreads these. */
export const baseOpenGraph = {
  type: "website" as const,
  siteName: SITE_NAME,
  locale: "en_AU",
  images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "CM Timberhaus bespoke timber furniture" }],
};

/** Trims to at most `max` characters on a word boundary, adding an ellipsis when it cuts. */
function truncateDescription(text: string, max: number = MAX_DESCRIPTION_LENGTH): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  const room = clean.slice(0, max - 1);
  const lastSpace = room.lastIndexOf(" ");
  const cut = lastSpace > max * 0.5 ? room.slice(0, lastSpace) : room;
  return `${cut.replace(/[\s,;:.–—-]+$/, "")}…`;
}

interface PageMetadataInput {
  title: string;
  description: string;
  path: string;
}

/** Page-level metadata: trimmed description, canonical and og:url for the page path. */
export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  const trimmed = truncateDescription(description);
  return {
    title,
    description: trimmed,
    alternates: { canonical: path },
    openGraph: {
      ...baseOpenGraph,
      url: path,
      title: `${title} | ${SITE_NAME}`,
      description: trimmed,
    },
  };
}

/** JSON for an inline <script type="application/ld+json">, with "<" escaped so content cannot close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
