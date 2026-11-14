import imageDimensions from "../../content/images.json";

interface ImageRecord {
  width: number;
  height: number;
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

/** The logo is the only image still served from public/images. */
export function getImage(name: string): ImageSource {
  const record = records[name];
  if (!record) {
    throw new Error(`Unknown image "${name}". Check content/images.json and public/images.`);
  }
  return { src: `/images/${name}.png`, width: record.width, height: record.height };
}
