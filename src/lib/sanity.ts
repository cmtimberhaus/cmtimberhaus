import { createClient } from "@sanity/client";
import { createImageUrlBuilder } from "@sanity/image-url";
import { LARGE, SMALL, scaled, type ImageSource } from "./images";

const PROJECT_ID = "ka21otlh";
const DATASET = "production";

/** Published content only. The dataset is public, so the build needs no token. */
const client = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: "2025-01-01",
  useCdn: false,
  perspective: "published",
});

const builder = createImageUrlBuilder({ projectId: PROJECT_ID, dataset: DATASET });

/** GROQ projection that every image field uses. */
export const IMAGE_PROJECTION = `{
  alt,
  "ref": asset._ref,
  "width": asset->metadata.dimensions.width,
  "height": asset->metadata.dimensions.height
}`;

export interface RawImage {
  alt: string | null;
  ref: string | null;
  width: number | null;
  height: number | null;
}

export function fetchSanity<T>(query: string): Promise<T> {
  return client.fetch<T>(query);
}

const WEBP_QUALITY = 85;

function urlAtWidth(ref: string, width: number): string {
  return builder
    .image({ _type: "image", asset: { _type: "reference", _ref: ref } })
    .width(width)
    .format("webp")
    .quality(WEBP_QUALITY)
    .url();
}

/** Same two-size srcset the repo images had: long edge 800 and 1600, never enlarged. */
export function toImageSource(image: RawImage & { ref: string; width: number; height: number }): ImageSource {
  const small = scaled(image, SMALL);
  const large = scaled(image, LARGE);
  return {
    src: urlAtWidth(image.ref, large.width),
    srcSet: `${urlAtWidth(image.ref, small.width)} ${small.width}w, ${urlAtWidth(image.ref, large.width)} ${large.width}w`,
    width: large.width,
    height: large.height,
  };
}
