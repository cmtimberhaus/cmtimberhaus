import imageDimensions from "../../content/images.json";

interface ImageRecord {
  width: number;
  height: number;
  format: "webp" | "png";
}

export interface ImageSource {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
}

const records: Record<string, ImageRecord> = imageDimensions as Record<string, ImageRecord>;

export const LOGO_IMAGE = "logo";

export const SMALL = 800;
export const LARGE = 1600;

/** Size after scaling so the long edge is at most `longEdge`, never enlarging. */
export function scaled(size: { width: number; height: number }, longEdge: number): { width: number; height: number } {
  const ratio = Math.min(1, longEdge / Math.max(size.width, size.height));
  return { width: Math.round(size.width * ratio), height: Math.round(size.height * ratio) };
}

/** Repo images. Only the logo is still served from public/images. */
export function getImage(name: string): ImageSource {
  const record = records[name];
  if (!record) {
    throw new Error(`Unknown image "${name}". Check content/images.json and public/images.`);
  }

  if (record.format === "png") {
    return { src: `/images/${name}.png`, width: record.width, height: record.height };
  }

  const small = scaled(record, SMALL);
  const large = scaled(record, LARGE);
  return {
    src: `/images/${name}-${LARGE}.webp`,
    srcSet: `/images/${name}-${SMALL}.webp ${small.width}w, /images/${name}-${LARGE}.webp ${large.width}w`,
    width: large.width,
    height: large.height,
  };
}
